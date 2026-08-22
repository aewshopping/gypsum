/**
 * @file Renders the recent files side panel — each file opened this session, most recent first.
 */

import { appState } from '../services/store.js';
import { renderFilename } from './ui-functions-render/render-filename.js';

/**
 * Renders the recent files list into the side panel.
 * Entries whose file is no longer loaded — deleted, or renamed to a new internalId — are
 * dropped, so the panel only ever offers files it can actually open.
 * @returns {void}
 */
export function renderSidebarRecent() {
    const filesById = new Map(appState.myFiles.map(file => [file.internalId, file]));

    // The modal records the file it is showing, so the entry you are looking at can be marked.
    const openFileId = document.getElementById('file-content-modal').dataset.fileId ?? '';

    const entries_html = [...appState.recentFiles]
        .map(fileId => filesById.get(fileId))
        .filter(file => file !== undefined)
        .map(file => `
            <button class="sidebar-recent-item color-dynamic" data-color="${file.color}"
                    data-file-id="${file.internalId}" data-action="open-recent-file"
                    ${file.internalId === openFileId ? 'data-current' : ''}
                    data-tip="open file">${renderFilename(file.filepath)}</button>`)
        .join('');

    document.getElementById('sidebar-recent-list').innerHTML =
        entries_html || `<p class="sidebar-recent-empty">No files opened yet.</p>`;
}
