import { appState } from '../services/store.js';
import { hasYamlError } from '../services/file-parsing/file-errors.js';
import { linkedProperty } from '../services/linked-properties.js';
import { filesById } from '../services/internal-links/linked-value.js';
import { copyTargetProblem, keysIgnoringCase } from '../services/property-name.js';
import { applyRawEdits } from './apply-raw-edits.js';
import { isFrontMatterSource, sourceValue, copyText, sourceHeading } from './copy-source-value.js';
import { pushUndoBatch, dropUndoBatch } from '../table-undo/undo-stacks.js';
import { saveUndoFile } from '../table-undo/undo-file.js';
import { followPropertyCopy } from '../table-layouts/follow-property-copy.js';

/**
 * @file Copying a column into a property of every note — a new property, or one that exists,
 * overwritten — as one batch that one undo puts back. The service: no DOM, no dialog. Built as
 * delete-property.js and rename-property.js are, and on the same writer. See
 * plans/completed/table-copy-column.md.
 *
 * **One edit per note, to one key**: the target's value replaced, or the key appended. That is the
 * edit a cell commit makes, so there is no new kind of splice and nothing new for undo to learn. A
 * note whose target already says what would be written is dropped by the writer as a no-op, which is
 * what makes pressing copy again — the way a copied linked column is brought up to date — write only
 * the notes whose value moved. §3.2.
 */

/**
 * Copies `source` into `target` in every note with something to copy, recording the undo entry
 * **before** the first note is touched.
 *
 * 1. *Locate* — a front matter source only: plan the source key's removal without writing, as the
 *    rename does, which yields each note's source value span. Those bytes are what is copied, so the
 *    note's quoting, list style and item comments come across unchanged.
 * 2. *Plan* the edits to the target. Their records are the journal, pushed and saved before anything
 *    is written — the delete's crash-safety, unchanged.
 * 3. *Write* the planned text, each edit carrying `expect`: the target as the plan found it, or no
 *    target at all, so a note edited in between is refused rather than overwritten.
 *
 * **The source is not re-checked.** `expect` guards the target, and a linked column's values are
 * worked out once, before the plan — so a copy is a snapshot of the moment it was pressed. §3.2, §3.4.
 *
 * @param {string} source - The column being copied: a property, or a linked column's key.
 * @param {string} target - The property to copy into.
 * @param {(done: number, total: number) => void} [onProgress] - Called as each note is written.
 * @returns {Promise<{copied: number, overwritten: number, matched: number, skipped: number,
 *   layoutSaved: boolean}>} Notes written; how many of those had a value replaced; notes already
 *   holding the value; notes with something to copy that were left alone — locked, or changed since;
 *   and whether the layouts file took the column.
 */
export async function copyProperty(source, target, onProgress) {
    // Fixed now, for the journal's writes as well as the notes': a folder loaded meanwhile must not
    // receive either.
    const dirHandle = appState.dirHandle;
    const linked = linkedProperty(source) ?? null;

    // Asked again here, whatever the dialog said, so nothing can start a copy the dialog would refuse.
    const problem = copyTargetProblem(source, target, keysIgnoringCase(appState.myFiles), linked);
    if (problem) throw new Error(problem);

    const { edits, having } = await targetEdits(source, target, linked);
    const locked = having - edits.length;

    const planned = await applyRawEdits(edits, { write: false });
    const matched = edits.length - planned.length;
    if (planned.length === 0) return { copied: 0, overwritten: 0, matched, skipped: locked, layoutSaved: true };

    const { batch, saved } = pushUndoBatch(planned,
        { kind: 'copy-property', property: sourceHeading(source), to: target, dirHandle });

    // Nothing is overwritten that could not be put back.
    if (!await saved) {
        await dropUndoBatch(batch, dirHandle);
        throw new Error('the undo history could not be saved, so nothing was copied');
    }

    let layoutSaved = Promise.resolve(true);
    const follow = (records) => {
        layoutSaved = followPropertyCopy(source, target, records, linked);
        return new Set();
    };

    const applied = await applyRawEdits(planned.map(record => ({
        internalId: record.internalId,
        property: target,
        raw: record.after,
        keepKey: record.after === '',
        expect: record.existed ? record.before : null,
    })), { onProgress, beforeRefresh: follow });

    // The entry now holds what actually happened; a pass that wrote nothing leaves no entry at all.
    if (applied.length === 0) {
        await dropUndoBatch(batch, dirHandle);
    } else {
        batch.edits = applied;
        await saveUndoFile(dirHandle);
    }

    return {
        copied: applied.length,
        overwritten: applied.filter(record => record.existed).length,
        matched,
        skipped: locked + planned.length - applied.length,
        layoutSaved: await layoutSaved,
    };
}

/**
 * One edit to the target per note with something to copy, and how many notes that is before the
 * locked ones are left out — every locked note is counted as skipped, never as matching.
 *
 * A bare source key is copied as a bare key: its span is '', which the writer would otherwise read
 * as "take the key out", so it goes with `keepKey`.
 *
 * @param {string} source
 * @param {string} target
 * @param {{via: string, read: string}|null} linked
 * @returns {Promise<{edits: Array<object>, having: number}>}
 */
async function targetEdits(source, target, linked) {
    if (isFrontMatterSource(source)) {
        const carrying = appState.myFiles.filter(file => Object.hasOwn(file, source));
        const located = await applyRawEdits(carrying.map(file => ({ internalId: file.internalId, property: source, raw: '' })),
            { write: false });
        return {
            having: carrying.length,
            edits: located.map(({ internalId, before }) => ({ internalId, property: target, raw: before, keepKey: before === '' })),
        };
    }

    // Every value worked out now, from the file objects as they stand, so a note written part-way
    // through cannot change what a later note reads. §3.4.4.
    const byId = filesById(appState.myFiles);
    const having = appState.myFiles
        .map(file => ({ file, value: sourceValue(source, file, byId, linked) }))
        .filter(({ value }) => value !== undefined);
    return {
        having: having.length,
        edits: having
            .filter(({ file }) => !hasYamlError(file))
            .map(({ file, value }) => ({ internalId: file.internalId, property: target, raw: (shape) => copyText(value, shape) })),
    };
}
