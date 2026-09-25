/**
 * @file Keeps the undo history pointing at a renamed note.
 *
 * A rename gives the file a new internalId — its new filepath — which would orphan every saved
 * entry for it. So the ids are rewritten in both stacks and in the refusals, and the file saved, just
 * as rename-backups.js keeps history.gypsum in step. plans/completed/table-delete-column.md §8.4.
 */

import { appState } from '../services/store.js';
import { saveUndoFile } from './undo-file.js';

/**
 * @param {string} oldId - The file's internalId before the rename.
 * @param {string} newId - Its internalId now.
 * @returns {void}
 */
export function renameInUndoStacks(oldId, newId) {
    let changed = false;
    for (const batch of [...appState.undoStack, ...appState.redoStack]) {
        for (const edit of batch.edits) {
            if (edit.internalId !== oldId) continue;
            edit.internalId = newId;
            changed = true;
        }
    }

    // A renamed note keeps its mark from the last undo, or the filter to it would lose it.
    if (appState.undoRefusals.has(oldId)) {
        appState.undoRefusals.set(newId, appState.undoRefusals.get(oldId));
        appState.undoRefusals.delete(oldId);
    }

    if (changed) saveUndoFile();
}
