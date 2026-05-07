import { loadSavedHandle, clearSavedHandle } from './folder-handle-storage.js';
import { loadDirectoryFromHandle } from '../directory-handler.js';
import { showWarningModal } from '../../ui/ui-functions-click/warning-modal.js';
import { appState, FILE_PROPERTIES } from '../store.js';
import { renderTagTaxonomy } from '../../ui/render-tag-taxonmy.js';
import { sortAppStateFiles } from '../file-object-sort.js';
import { populateSortSelect } from '../../ui/ui-elements-load/sort-select-load.js';
import { renderFiles } from '../../ui/ui-functions-render/a-render-all-files.js';
import { addActionHandlers } from '../../ui/event-listeners-add.js';

/**
 * Loads a directory from a handle, sorts, and renders.
 * @param {FileSystemDirectoryHandle} handle
 * @returns {Promise<void>}
 */
async function renderDirectoryFromHandle(handle) {
    await loadDirectoryFromHandle(handle);
    if (appState.tagTaxonomyVisible) renderTagTaxonomy();
    const sortProp = appState.sortState.property;
    sortAppStateFiles(sortProp, FILE_PROPERTIES.get(sortProp).type, appState.sortState.direction);
    populateSortSelect();
    renderFiles();
    addActionHandlers();
}

/**
 * On page load, checks IndexedDB for a saved directory handle and restores it if possible.
 * Auto-loads if permission is already granted; prompts via warning modal if not.
 * @returns {Promise<void>}
 */
export async function restoreSavedFolder() {
    try {
        const handle = await loadSavedHandle();
        if (!handle) return;

        const permission = await handle.queryPermission({ mode: 'readwrite' });

        if (permission === 'granted') {
            await renderDirectoryFromHandle(handle);
        } else if (permission === 'prompt') {
            showWarningModal(
                `Reopen "${handle.name}"?`,
                'Open',
                'Cancel',
                async () => {
                    const granted = await handle.requestPermission({ mode: 'readwrite' });
                    if (granted === 'granted') {
                        await renderDirectoryFromHandle(handle);
                    } else {
                        await clearSavedHandle();
                        console.log('Filesystem permission denied; cleared saved folder.');
                    }
                }
            );
        } else {
            await clearSavedHandle();
            console.log('Filesystem permission denied; cleared saved folder.');
        }
    } catch (err) {
        console.log('Could not restore saved folder:', err);
    }
}
