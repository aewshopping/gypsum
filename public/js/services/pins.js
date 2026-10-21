/**
 * @file Which notes are pinned to the top of the order — see plans/completed/note-pinning.md.
 *
 * Session state only: a pin is never written to a note, and a folder load clears it. Held as a Set of
 * internalIds rather than a property on the file object, because rereadFile() rebuilds that object
 * after every save and front matter is spread into it — a `pin` property would be lost on the first
 * keystroke and could be supplied by any note.
 */

import { appState } from './store.js';

/**
 * @param {string} fileId - The file's internalId.
 * @returns {boolean} Whether the note is pinned.
 */
export function isPinned(fileId) {
    return appState.pinnedIds.has(fileId);
}

/**
 * Pins the note if it is not pinned, and unpins it if it is.
 * @param {string} fileId - The file's internalId.
 * @returns {void}
 */
export function togglePin(fileId) {
    if (!appState.pinnedIds.delete(fileId)) appState.pinnedIds.add(fileId);
}

/**
 * Pins the note, whether or not it already was. For a note made pinned — the table's new-note button.
 * @param {string} fileId - The file's internalId.
 * @returns {void}
 */
export function pin(fileId) {
    appState.pinnedIds.add(fileId);
}

/**
 * Unpins the note. A deleted note's pin goes with it, so a new note given the freed name does not
 * arrive already pinned.
 * @param {string} fileId - The file's internalId.
 * @returns {void}
 */
export function unpin(fileId) {
    appState.pinnedIds.delete(fileId);
}

/**
 * Moves a pin to a note's new id after a rename, so the note keeps it and the old name does not.
 * @param {string} fromId - The internalId before the rename.
 * @param {string} toId - The internalId after it.
 * @returns {void}
 */
export function movePin(fromId, toId) {
    if (!appState.pinnedIds.delete(fromId)) return;
    appState.pinnedIds.add(toId);
}
