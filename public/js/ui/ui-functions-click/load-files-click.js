/**
 * @file Click handlers for the three ways files enter the app: a chosen folder, an existing
 * OPFS, and a tarball imported into OPFS. All three share the same post-load steps.
 */

import { loadDirectoryFileHandles } from '../../services/directory-handler.js';
import { importTarGzipToOPFS, loadFromOPFS } from '../../backup/opfs-import.js';
import { renderTagTaxonomy } from '../render-tag-taxonmy.js';
import { sortAppStateFiles } from '../../services/file-object-sort.js';
import { appState } from '../../services/store.js';
import { propertyType } from '../../services/property-type.js';
import { populateSortSelect } from '../ui-elements-load/sort-select-load.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { addActionHandlers } from '../event-listeners-add.js';
import { loadUndoStacks } from '../../table-undo/undo-stacks.js';

// A column delete across a folder runs for seconds, and the sidebar's load buttons are outside the
// inert table. Loading a folder meanwhile is refused outright, and closing the tab asks first — the
// journal makes a closed tab safe, this makes it rare. The same guard rename-file.js raises.
// plans/table-delete-column.md §6.2a.
window.addEventListener('beforeunload', (evt) => {
    if (appState.bulkWriteInFlight) evt.preventDefault();
});

/**
 * Opens the folder picker and loads the chosen directory.
 * The picker must be reached without awaiting anything first, so the click's user
 * activation still stands when showDirectoryPicker() is called.
 * @returns {Promise<void>}
 */
export async function handleLoadFolder() {
    if (appState.bulkWriteInFlight) return;
    const btn = document.getElementById('btn_loadDirectoryHandles');
    let minDuration;
    try {
        await loadDirectoryFileHandles(() => {
            btn.classList.add('loading');
            appState.myFiles = [];
            // The last undo's refusals name notes in the folder being left. Emptied before the new
            // files are checked, or a note sharing a path would be marked for them.
            appState.undoRefusals = new Map();
            appState.isLoading = true;
            renderFiles();
            minDuration = new Promise(r => setTimeout(r, 2000));
        });
        await postLoad();
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
    if (appState.bulkWriteInFlight) return;
    loadAndProcess(loadFromOPFS, 'btn-load-opfs');
}

/**
 * Opens the file picker for a .tar.gz backup and unpacks it into OPFS.
 * As with handleLoadFolder, nothing is awaited before the picker opens.
 * @returns {Promise<void>}
 */
export async function handleImportOPFS() {
    if (appState.bulkWriteInFlight) return;
    const btn = document.getElementById('btn-import-opfs');
    btn.classList.add('loading');
    appState.myFiles = [];
    appState.undoRefusals = new Map();
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
            await postLoad();
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
 * Shared post-load steps: the folder's undo history, tag taxonomy, sort, UI refresh.
 * All loading paths run this after populating appState.
 * @returns {Promise<void>}
 */
async function postLoad() {
    // Cleared before renderFiles below, or the empty-folder message is suppressed on the very
    // render that should show it.
    appState.isLoading = false;

    // An entry names a file by an id that means nothing against a different folder, so the stacks
    // are replaced by this folder's own, read from its .gypsum. Here rather than in each loader,
    // because all three run this. See plans/table-delete-column.md §8.2.
    await loadUndoStacks();
    // A folder just opened is a visit that has not done anything yet. §10.4.
    appState.undoHorizon = Date.now();
    if (appState.tagTaxonomyVisible) renderTagTaxonomy();
    const sortProp = appState.sortState.property;
    sortAppStateFiles(sortProp, propertyType(sortProp), appState.sortState.direction);
    populateSortSelect();
    renderFiles();
    addActionHandlers();
}

/**
 * Calls a loader function then runs shared post-load steps.
 * @param {Function} loaderFn - Async function that populates appState.myFiles.
 * @param {string} btnId - Id of the button that was pressed; it wears .loading while the load runs.
 * @returns {Promise<void>}
 */
async function loadAndProcess(loaderFn, btnId) {
    const btn = document.getElementById(btnId);
    btn.classList.add('loading');
    appState.myFiles = [];
    appState.undoRefusals = new Map();
    appState.isLoading = true;
    renderFiles();
    const minDuration = new Promise(r => setTimeout(r, 1000));
    try {
        await loaderFn();
        await postLoad();
        await minDuration;
    } catch (err) {
        // postLoad never ran, so isLoading is still set — and the empty-folder message in
        // a-render-all-files.js is gated on it, which would poison every later render.
        appState.isLoading = false;
        document.getElementById('fileCountElement').textContent = err?.message ?? '';
    } finally {
        btn.classList.remove('loading');
    }
}
