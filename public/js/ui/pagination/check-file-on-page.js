import { appState } from '../../services/store.js';

/**
 * Returns true if the file is on the current page.
 * pageFileIds is pre-computed from visibleFiles, which already applies the active
 * AND/OR filter mode, so no second filter check is needed here.
 * @param {number} fileId
 * @returns {boolean}
 */
export function checkFileOnPage(fileId) {
    return appState.paginationState.pageFileIds.has(fileId);
}
