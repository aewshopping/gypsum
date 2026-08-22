import { appState } from './store.js';

/**
 * @file Tracks which files have been opened, in the order they were opened.
 */

// Enough to scroll back through a long session without letting the list grow without limit.
const RECENT_FILES_MAX = 100;

/**
 * Records that a file has been opened, at the top of the recent files list.
 * Duplicates are kept: opening the same file twice adds it twice, because the list is a
 * history of opens rather than a set of distinct files.
 * @param {string} fileId - The internalId (full path from root) of the file just opened.
 * @returns {void}
 */
export function recordFileOpen(fileId) {
    appState.recentFiles.unshift(fileId);
    appState.recentFiles.length = Math.min(appState.recentFiles.length, RECENT_FILES_MAX);
}
