import { appState } from '../../services/store.js';
import { openFileContent } from './open-file-content-view-trans.js';
import { handleCloseHistory } from './history-modal.js';
import { handleCloseSettings } from './settings-modal.js';

/**
 * Opens a file from its history row in the normal file content modal, where the history
 * select gives access to its versions. Both dialogs are closed first — the file modal is
 * itself a dialog, and would otherwise open behind them.
 *
 * No card to animate from: openFileContent already handles a null animateFrom, as it does
 * for an internal link pointing at a file the current filters exclude.
 * @param {Event} event - The click event.
 * @param {HTMLElement} target - The row's open button, carrying the file's dataset.
 * @returns {void}
 */
export function handleHistoryOpenFile(event, target) {
    const fileId = target.dataset.fileId;
    const file = appState.myFiles.find(f => f.internalId === fileId);
    if (!file) return;

    handleCloseHistory();
    handleCloseSettings();
    openFileContent(fileId, file.color ?? '', null);
}
