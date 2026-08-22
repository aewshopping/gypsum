import { appState } from './store.js';

/**
 * @file Tracks which files have been opened, most recently opened first.
 */

// Enough to scroll back through a long session without letting the list grow without limit.
const RECENT_FILES_MAX = 100;

/**
 * Records that a file has been opened, at the top of the recent files list.
 * A file already in the list moves back to the top rather than gaining a second entry.
 * @param {string} fileId - The internalId (full path from root) of the file just opened.
 * @returns {void}
 */
export function recordFileOpen(fileId) {
    appState.recentFiles.delete(fileId); // dropped from wherever it was, so it can go back on top
    appState.recentFiles = new Set([fileId, ...appState.recentFiles].slice(0, RECENT_FILES_MAX));
}
