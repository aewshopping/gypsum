import { appState } from '../services/store.js';
import { VALUE_TYPES } from '../constants.js';
import { propertyType } from '../services/property-type.js';
import { parseYaml, coerceValue, isQuoted } from '../services/file-parsing/yaml-parse.js';
import { findFrontMatterIndices } from '../services/file-parsing/yaml-find.js';
import { toYamlText, toYamlItem } from '../services/file-parsing/yaml-value-write.js';
import { splitFlowItems } from '../services/file-parsing/flow-list.js';
import { saveFileCopy } from './save-file-copy.js';
import { refreshFileAfterSave } from './refresh-file-state.js';

/**
 * @file A cell edit, all the way into the note's front matter.
 *
 * Read the file fresh, find where the key's value sits, replace those bytes and nothing else, write
 * through the existing verified save, and let the existing refresh re-read the file and redraw the
 * table. **What you see after an edit is what the file actually contains**, checked every time
 * rather than assumed — see plans/completed/table-cell-writing.md §1.1.
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
    const rawEdits = edits.map(edit => {
        const type = propertyType(edit.property);
        return {
            internalId: edit.internalId,
            property: edit.property,
            // A function rather than a string, because the write keeps whatever style the file
            // already uses at that key and only the parse knows what that is. Deferring the call is
            // what keeps every question about format in yaml-value-write.js and every question
            // about bytes here; undo passes a plain string, which is text that came out of a file
            // already.
            raw: (shape) => toYamlText(edit.text, type, shape),
            ...(type === VALUE_TYPES.ARRAY.value && { items: splitFlowItems(edit.text) }),
        };
    });

    return applyRawEdits(rawEdits);
}

// changedItem() saying the list is exactly as the file already has it, which is not the same answer
// as "rewrite the whole value": nothing is written at all.
const SKIP = Symbol('no item changed');

/**
 * Where one item of a list has to be rewritten, when that is all that has happened to it.
 *
 * Splicing one item leaves every other byte alone, which is the only way a comment sitting between
 * two items survives an edit. Anything else — an item added, removed or reordered — is the whole
 * value rewritten, and the comment is the price of an editor that lets you rewrite the list at once.
 *
 * **What the file holds is compared through the parser's own coercion**, because capture is not the
 * inverse of render: a list of numbers is drawn as `1, 2, 10` and read back as strings, and a padded
 * item comes back trimmed. Comparing the raw slices would call every list of numbers changed and
 * rewrite it.
 *
 * @param {string} text - The whole file.
 * @param {object} span - The key's span, as parseYaml filled it in.
 * @param {string[]} items - What the cell now holds, item by item.
 * @returns {{start: number, end: number, written: string}|SKIP|null} The item's span and its new
 *   text; SKIP when no item changed; null when this is not a one-item edit.
 */
function changedItem(text, span, items) {
    if (span.items.length !== items.length) return null;

    const changed = span.items
        .map((range, index) => ({ range, item: items[index] }))
        .filter(({ range, item }) =>
            String(coerceValue(text.slice(range.valueStart, range.valueEnd))) !== item);

    if (changed.length === 0) return SKIP;
    if (changed.length > 1) return null;

    return {
        start: changed[0].range.valueStart,
        end: changed[0].range.valueEnd,
        written: toYamlItem(changed[0].item, span.form === 'flow'),
    };
}

/**
 * Puts already-converted text into the files, one verified write per file.
 *
 * `raw` is the text to write into the key's whole value span, the separating space included — or a
 * function returning it, given the shape the file already has at that key, which only this layer can
 * know. `items`, on a list edit, is what the cell now holds, item by item: when exactly
 * one of them has changed, that item's span is spliced and every other byte is left alone, a comment
 * sitting between two items included. `expect`, when given, is what the value span must currently
 * say for the edit to happen at all — the check an undo needs, stated as data so that it happens
 * inside the read this write already does rather than in a read of its own with a window between the
 * two. Nothing passes it yet.
 *
 * A key the note does not have is appended to the end of its block, and a note with no block at all
 * is given one. Not an edge case: a column exists because *some* file carries that key, so the empty
 * cells in every other row are exactly the ones someone wants to fill in.
 *
 * @param {Array<{internalId: string, property: string, raw: string|Function, items?: string[],
 *   expect?: string}>} rawEdits
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
        const original = await (await file.handle.getFile()).text();
        const indices = findFrontMatterIndices(original);

        const errors = [];
        const spans = new Map();
        parseYaml(original, errors, spans, indices);

        // §7: a file whose front matter did not read cleanly is not written into. A broken block
        // parses into something meaningless — '- apple: red' into a key nobody created — and
        // splicing into that makes it worse. The table locks those cells too; this is the same
        // question asked of the bytes on disk, which is the only place the answer is current.
        if (errors.length > 0) continue;

        // A note with no front matter at all is given a block at byte 0 — rather than anywhere
        // cleverer, because findFrontMatterIndices takes a separator on the first line at its word
        // however the rest of the file is written, where one lower down has first to be told apart
        // from a setext underline and a thematic break. Empty, so that a key is appended to it the
        // same way as to a block that was already there. A leading heading still becomes the title,
        // which is matched anywhere in the file rather than at its top.
        const text = indices ? original : `---\n---\n${original}`;

        // Where a key the note does not have is written: the first character of the closing
        // separator's line, which is where a key nobody has ordered belongs.
        const blockEnd = indices
            ? text.split('\n').slice(0, indices.end).reduce((offset, line) => offset + line.length + 1, 0)
            : '---\n'.length;

        const splices = [];
        fileEdits.forEach((edit, order) => {
            const span = spans.get(edit.property);
            const before = span ? text.slice(span.valueStart, span.valueEnd) : '';

            if (edit.expect !== undefined && edit.expect !== before) return;

            const item = span && edit.items ? changedItem(text, span, edit.items) : null;
            if (item === SKIP) return;

            // What the note already looks like at this key, so the write keeps its style rather
            // than choosing one: the form of the value, the indentation of its list items, and
            // whether it is quoted. A key the note does not have yet has none of it.
            const shape = span ? {
                form: span.form,
                itemPrefix: span.items.length
                    ? text.slice(span.items[0].lineStart, span.items[0].valueStart)
                    : undefined,
                quoted: isQuoted(before.trim()),
            } : {};
            const raw = typeof edit.raw === 'function' ? edit.raw(shape) : edit.raw;

            if (span && !item && raw === before) return;

            // Three shapes of splice: a key that is not there yet arrives as a whole line, one item
            // of a list replaces that item alone, and everything else replaces the key's value.
            const target = item
                ? { start: item.start, end: item.end, written: item.written }
                : span
                    ? { start: span.valueStart, end: span.valueEnd, written: raw }
                    : { start: blockEnd, end: blockEnd, written: `${edit.property}:${raw}\n` };

            splices.push({
                property: edit.property,
                order,
                ...target,
                before,
                // The record is the key's whole value span whichever splice it was. An item splice
                // happens inside that span, so the span afterwards is the same replacement applied
                // at the same offset — no re-parse needed.
                after: item
                    ? before.slice(0, target.start - span.valueStart) + target.written
                        + before.slice(target.end - span.valueStart)
                    : raw,
                existed: Boolean(span),
            });
        });
        if (splices.length === 0) continue;

        // Back to front. Splice the first key and every later span is off by the length delta;
        // working backwards keeps every span valid without recomputing anything. Two new keys share
        // the one insertion point, so they are applied back to front as well and end up in the
        // order they were asked for.
        splices.sort((a, b) => b.start - a.start || b.order - a.order);

        let updated = text;
        for (const splice of splices) {
            updated = updated.slice(0, splice.start) + splice.written + updated.slice(splice.end);
        }

        const snapshot = { filepath: file.filepath, filename: file.filename, content: original };
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
                existed: splice.existed,
            });
        }
    }

    return records;
}
