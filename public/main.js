import { loadFileHandles } from './js/services/file-handler.js';
import { loadDirectoryFileHandles, loadDirectoryFromHandle } from './js/services/directory-handler.js';
import { loadSavedHandle, clearSavedHandle } from './js/services/storage/folder-handle-storage.js';
import { showWarningModal } from './js/ui/ui-functions-click/warning-modal.js';
import { renderTagTaxonomy } from './js/ui/render-tag-taxonmy.js';
import { sortAppStateFiles } from './js/services/file-object-sort.js';
import { appState, FILE_PROPERTIES } from './js/services/store.js';
import { initSortSelect, populateSortSelect } from './js/ui/ui-elements-load/sort-select-load.js';
import { initViewSelect } from './js/ui/ui-elements-load/views-select-load.js';
import { renderFiles } from './js/ui/ui-functions-render/a-render-all-files.js';
import { addActionHandlers } from './js/ui/event-listeners-add.js';

window.appState = appState; // exposed for debugging and tests

document.addEventListener('DOMContentLoaded', function () {

    const loadFilesButton = document.querySelector('[data-click-loadfiles]');
    loadFilesButton.addEventListener('click', function () {
        conductor();
    });

    const loadFolderButton = document.querySelector('[data-click-loadfolder]');
    loadFolderButton.addEventListener('click', async function () {
        await loadDirectoryData();
        populateSortSelect();
        renderFiles();
        addActionHandlers();
    });

    initViewSelect();
    initSortSelect();

    const searchbox = document.getElementById("searchbox");
    const searchmode = appState.search.depth.searchMode;
    searchbox.placeholder = appState.search.depth.prompt[searchmode];

    addActionHandlers();

    (async () => {
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
    })();

});

/**
 * Loads a directory from a handle, sorts, and renders.
 * @async
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
 * Orchestrates the data loading and initial rendering process.
 * This function is called when the "Load Files" button is clicked.
 * @async
 * @function conductor
 * @returns {Promise<void>}
 */
async function conductor() {
    await loadData();
    populateSortSelect();
    renderFiles();
    addActionHandlers();
}

/**
 * Loads file data, processes tags/taxonomy, and sorts the files based on the initial state.
 * @async
 * @function loadData
 * @returns {Promise<void>}
 */
async function loadData() {

    await loadFileHandles();

    if (appState.tagTaxonomyVisible) renderTagTaxonomy();

    const sortProp = appState.sortState.property
    const sortType = FILE_PROPERTIES.get(sortProp).type;
    const sortDirection = appState.sortState.direction

    sortAppStateFiles(sortProp, sortType, sortDirection);
}

/**
 * Loads file data from a directory (recursively), processes tags/taxonomy, and sorts the files.
 * @async
 * @function loadDirectoryData
 * @returns {Promise<void>}
 */
async function loadDirectoryData() {

    await loadDirectoryFileHandles();

    if (appState.tagTaxonomyVisible) renderTagTaxonomy();

    const sortProp = appState.sortState.property
    const sortType = FILE_PROPERTIES.get(sortProp).type;
    const sortDirection = appState.sortState.direction

    sortAppStateFiles(sortProp, sortType, sortDirection);
}
