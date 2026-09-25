import { appState } from '../services/store.js';
import { hasYamlError } from '../services/file-parsing/file-errors.js';
import { applyRawEdits } from './apply-raw-edits.js';
import { pushUndoBatch, dropUndoBatch } from '../table-undo/undo-stacks.js';
import { saveUndoFile } from '../table-undo/undo-file.js';

/**
 * @file Deleting a property from every note in the folder — key, value and every line of a block
 * list — as one batch that one undo puts back. The service: no DOM, no dialog.
 *
 * Every file in the loaded folder, whatever is filtered or paged: "delete the property" means just
 * that. The column is left standing, faded as empty, exactly as clearing its cells one by one would
 * leave it — a column belongs to the layout, not to the files. See plans/table-delete-column.md.
 */

/**
 * What a delete of this property would do, from appState alone, so the confirmation opens at once
 * however large the folder. A forecast: the write re-checks every file against its bytes on disk.
 *
 * **The count is of the files that will change**, not of the files that carry the key: a note whose
 * front matter did not read is carried but skipped, and a button promising to delete from it would
 * promise a write it will not make. §5.
 *
 * @param {string} property
 * @returns {{changing: number, skipped: number, samples: string[]}} How many notes will lose the key,
 *   how many carry it but are locked, and the names of up to three that will change.
 */
export function deletionForecast(property) {
    const carrying = appState.myFiles.filter(file => Object.hasOwn(file, property));
    const changing = carrying.filter(file => !hasYamlError(file));
    return {
        changing: changing.length,
        skipped: carrying.length - changing.length,
        samples: changing.slice(0, 3).map(file => file.filename),
    };
}

/**
 * Takes the property out of every note that has it, recording the undo entry **before** the first
 * note is touched.
 *
 * **Two passes, both through applyRawEdits.** The plan pass reads every loaded file and works out
 * each removal without writing, which yields every file's `before` — the text being removed. That
 * batch is pushed and undo.gypsum written, and only then does the write pass run, each edit now
 * carrying `expect: before`. If the tab dies half-way, the saved entry lists some edits that never
 * happened; undoing one finds the key still there rather than the '' it expects, and refuses it. So
 * the existing check makes the journal crash-safe with no recovery code — and it also refuses a note
 * edited between the two passes rather than writing a stale splice into it. §8.3.
 *
 * **Only the files that carry the key are planned.** A bare `people:` is on the file object as null
 * (plans/bare-keys-as-null.md), so appState sees every note the delete will reach and no other note
 * is read. Such a file yields a record with `before: ''`, and undo puts it back bare.
 *
 * @param {string} property
 * @param {(done: number, total: number) => void} [onProgress] - Called as each note is written.
 * @returns {Promise<{deleted: number, skipped: number}>} How many notes lost the key, and how many
 *   that carried it at the start were left alone — locked, or changed since.
 */
export async function deleteProperty(property, onProgress) {
    // Fixed now, for the journal's writes as well as the notes': a folder loaded meanwhile must not
    // receive either. §6.2a.
    const dirHandle = appState.dirHandle;
    const carrying = new Set(appState.myFiles
        .filter(file => Object.hasOwn(file, property))
        .map(file => file.internalId));

    const edits = [...carrying].map(internalId => ({ internalId, property, raw: '' }));
    const planned = await applyRawEdits(edits, { write: false });
    if (planned.length === 0) return { deleted: 0, skipped: carrying.size };

    const { batch, saved } = pushUndoBatch(planned, { kind: 'delete-property', property, dirHandle });

    // Nothing is deleted that could not be put back. A journal that did not reach the disk is a
    // delete whose only copy would die with the tab.
    if (!await saved) {
        await dropUndoBatch(batch, dirHandle);
        throw new Error('the undo history could not be saved, so nothing was deleted');
    }

    const applied = await applyRawEdits(planned.map(record => ({
        internalId: record.internalId,
        property,
        raw: '',
        expect: record.before,
    })), { onProgress });

    // The entry now holds what actually happened. A pass that wrote nothing leaves no entry at all,
    // or the list would offer a delete that does nothing when pressed.
    if (applied.length === 0) {
        await dropUndoBatch(batch, dirHandle);
    } else {
        batch.edits = applied;
        await saveUndoFile(dirHandle);
    }

    const deleted = new Set(applied.map(record => record.internalId));
    return {
        deleted: deleted.size,
        skipped: [...carrying].filter(id => !deleted.has(id)).length,
    };
}
