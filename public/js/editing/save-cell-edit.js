import { appState } from '../services/store.js';
import { VALUE_TYPES } from '../constants.js';
import { propertyType } from '../services/property-type.js';
import { parseYaml } from '../services/file-parsing/yaml-parse.js';
import { toYamlText } from '../services/file-parsing/yaml-value-write.js';
import { saveFileCopy } from './save-file-copy.js';
import { refreshFileAfterSave } from './refresh-file-state.js';

/**
 * @file A cell edit, all the way into the note's front matter.
 *
 * Read the file fresh, find where the key's value sits, replace those bytes and nothing else, write
 * through the existing verified save, and let the existing refresh re-read the file and redraw the
 * table. **What you see after an edit is what the file actually contains**, checked every time
 * rather than assumed — see plans/table-cell-writing.md §1.1.
 *
 * **Never rebuild the block from the parsed values.** That silently destroys comments, key order,
 * blank lines and anything the parser skipped. The smallest span that does the job is replaced, and
 * the spans come from the parser itself rather than from a second reading of the same text.
 *
 * Two layers, because converting a typed value and putting bytes in a file are different jobs:
 * `applyCellEdits` knows about types and the quoting rule, `applyRawEdits` about spans, splicing
 * and the write. §4.6.
 */

/**
 * Writes what was typed in one or more cells back into their notes.
 *
 * **A list of edits rather than one**, because a pasted range updating fifty rows cannot be fifty
 * verified write cycles and fifty refreshes. Today only one ever arrives, which is the point: the
 * batch is the real shape of the operation and retrofitting it means a second module that knows how
 * to splice front matter.
 *
 * @param {Array<{internalId: string, property: string, text: string}>} edits
 * @returns {Promise<Array<object>>} One record per edit that changed a file — see applyRawEdits.
 */
export async function applyCellEdits(edits) {
    const rawEdits = edits
        // A list is several values in one cell and is written a different way; lifted by step 5 of
        // plans/table-cell-writing.md.
        .filter(edit => propertyType(edit.property) !== VALUE_TYPES.ARRAY.value)
        .map(edit => ({
            internalId: edit.internalId,
            property: edit.property,
            raw: toYamlText(edit.text, propertyType(edit.property)),
        }));

    return applyRawEdits(rawEdits);
}

/**
 * Puts already-converted text into the files, one verified write per file.
 *
 * `raw` is the text to write into the key's whole value span, the separating space included.
 * `expect`, when given, is what that span must currently say for the edit to happen at all — the
 * check an undo needs, stated as data so that it happens inside the read this write already does
 * rather than in a read of its own with a window between the two. Nothing passes it yet.
 *
 * @param {Array<{internalId: string, property: string, raw: string, expect?: string}>} rawEdits
 * @returns {Promise<Array<{internalId: string, property: string, before: string, after: string,
 *   existed: boolean}>>} One record per edit that changed a file, holding the key's whole value
 *   span before and after. Nothing reads it yet; undo is what it is for.
 */
async function applyRawEdits(rawEdits) {
    const byFile = new Map();
    for (const edit of rawEdits) {
        if (!byFile.has(edit.internalId)) byFile.set(edit.internalId, []);
        byFile.get(edit.internalId).push(edit);
    }

    const records = [];

    for (const [internalId, fileEdits] of byFile) {
        const file = appState.myFiles.find(candidate => candidate.internalId === internalId);
        const text = await (await file.handle.getFile()).text();

        const errors = [];
        const spans = new Map();
        parseYaml(text, errors, spans);

        // §7: a file whose front matter did not read cleanly is not written into. A broken block
        // parses into something meaningless — '- apple: red' into a key nobody created — and
        // splicing into that makes it worse. The table locks those cells too; this is the same
        // question asked of the bytes on disk, which is the only place the answer is current.
        if (errors.length > 0) continue;

        const splices = [];
        for (const edit of fileEdits) {
            // No span means the key is not in the block, or there is no block. Lifted by step 4.
            const span = spans.get(edit.property);
            if (!span) continue;

            const before = text.slice(span.valueStart, span.valueEnd);
            if (edit.expect !== undefined && edit.expect !== before) continue;
            if (edit.raw === before) continue;

            splices.push({
                property: edit.property,
                start: span.valueStart,
                end: span.valueEnd,
                before,
                after: edit.raw,
            });
        }
        if (splices.length === 0) continue;

        // Back to front. Splice the first key and every later span is off by the length delta;
        // working backwards keeps every span valid without recomputing anything.
        splices.sort((a, b) => b.start - a.start);

        let updated = text;
        for (const splice of splices) {
            updated = updated.slice(0, splice.start) + splice.after + updated.slice(splice.end);
        }

        const snapshot = { filepath: file.filepath, filename: file.filename, content: text };
        if (!await saveFileCopy(snapshot, updated)) continue;

        // Not re-sorted: edit a cell in the column the table is sorted by and the row leaps away
        // from under you.
        //
        // One refresh per file, which a batch across several files will have to change:
        // refreshFileAfterSave holds one queued refresh and cancels the previous one, so it would
        // re-parse only the last file and leave the rest stale in memory — and render them. A
        // single edit is unaffected.
        refreshFileAfterSave(snapshot, false);

        for (const splice of splices) {
            records.push({
                internalId,
                property: splice.property,
                before: splice.before,
                after: splice.after,
                existed: true,
            });
        }
    }

    return records;
}
