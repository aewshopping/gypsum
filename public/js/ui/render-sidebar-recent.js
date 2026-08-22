/**
 * @file Renders the recent files side panel — each file opened this session, most recent first.
 */

import { appState } from '../services/store.js';
import { renderFilename } from './ui-functions-render/render-filename.js';
import { fileTransitionName } from './ui-functions-render/file-transition-name.js';

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
        // The 'recent-' prefix keeps these names clear of the ones a-render-all-files.js puts on
        // the grid cards — two elements may not carry the same view-transition-name at once.
        // sidebar-recent.css turns the name on, but only while the panel is open.
        .map(file => `
            <button class="sidebar-recent-item color-dynamic" data-color="${file.color}"
                    data-file-id="${file.internalId}" data-action="open-recent-file"
                    data-vt-name="recent-${fileTransitionName(file.internalId)}"
                    ${file.internalId === openFileId ? 'data-current' : ''}
                    data-tip="open file">${renderFilename(file.filepath)}</button>`)
        .join('');

    document.getElementById('sidebar-recent-list').innerHTML =
        entries_html || `<p class="sidebar-recent-empty">No files opened yet.</p>`;
}
