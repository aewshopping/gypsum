/**
 * @file Click handlers for the three ways files enter the app: a chosen folder, an existing
 * OPFS, and a tarball imported into OPFS. All three share the same post-load steps.
 */

import { loadDirectoryFileHandles } from '../../services/directory-handler.js';
import { importTarGzipToOPFS, loadFromOPFS } from '../../backup/opfs-import.js';
import { renderTagTaxonomy } from '../render-tag-taxonmy.js';
import { sortAppStateFiles } from '../../services/file-object-sort.js';
import { appState, FILE_PROPERTIES } from '../../services/store.js';
import { populateSortSelect } from '../ui-elements-load/sort-select-load.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { addActionHandlers } from '../event-listeners-add.js';

/**
 * Opens the folder picker and loads the chosen directory.
 * The picker must be reached without awaiting anything first, so the click's user
 * activation still stands when showDirectoryPicker() is called.
 * @returns {Promise<void>}
 */
export async function handleLoadFolder() {
    const btn = document.getElementById('btn_loadDirectoryHandles');
    let minDuration;
    try {
        await loadDirectoryFileHandles(() => {
            btn.classList.add('loading');
            appState.myFiles = [];
            appState.isLoading = true;
            renderFiles();
            minDuration = new Promise(r => setTimeout(r, 2000));
        });
        postLoad();
        await minDuration;
    } finally {
        btn.classList.remove('loading');
    }
}

/**
 * Loads the files already sitting in OPFS, without re-importing.
 * @returns {void}
 */
export function handleLoadOPFS() {
    loadAndProcess(loadFromOPFS);
}

/**
 * Opens the file picker for a .tar.gz backup and unpacks it into OPFS.
 * As with handleLoadFolder, nothing is awaited before the picker opens.
 * @returns {Promise<void>}
 */
export async function handleImportOPFS() {
    const btn = document.getElementById('btn_loadDirectoryHandles');
    btn.classList.add('loading');
    appState.myFiles = [];
    appState.isLoading = true;
    renderFiles();
    document.getElementById('fileCountElement').textContent = 'file: unpacking';
    const minDuration = new Promise(r => setTimeout(r, 1000));
    const removeLoading = () => {
        appState.isLoading = false;
        btn.classList.remove('loading');
    };
    try {
        await importTarGzipToOPFS(async () => {
            postLoad();
            document.getElementById('btn-load-opfs').disabled = false;
            await minDuration;
            removeLoading();
        });
    } catch (err) {
        removeLoading();
        if (err?.name !== 'AbortError') {
            document.getElementById('fileCountElement').textContent = err?.message ?? '';
        }
    }
}

/**
 * Shared post-load steps: tag taxonomy, sort, UI refresh.
 * All loading paths run this after populating appState.
 */
function postLoad() {
    // Cleared before renderFiles below, or the empty-folder message is suppressed on the very
    // render that should show it.
    appState.isLoading = false;
    if (appState.tagTaxonomyVisible) renderTagTaxonomy();
    const sortProp = appState.sortState.property;
    sortAppStateFiles(sortProp, FILE_PROPERTIES.get(sortProp).type, appState.sortState.direction);
    populateSortSelect();
    renderFiles();
    addActionHandlers();
}

/**
 * Calls a loader function then runs shared post-load steps.
 * @param {Function} loaderFn - Async function that populates appState.myFiles.
 * @returns {Promise<void>}
 */
async function loadAndProcess(loaderFn) {
    const btn = document.getElementById('btn_loadDirectoryHandles');
    btn.classList.add('loading');
    appState.myFiles = [];
    appState.isLoading = true;
    renderFiles();
    const minDuration = new Promise(r => setTimeout(r, 1000));
    try {
        await loaderFn();
        postLoad();
        await minDuration;
    } finally {
        btn.classList.remove('loading');
    }
}
