import { loadFileHandles } from './js/services/file-handler.js';
import { loadDirectoryFileHandles } from './js/services/directory-handler.js';
import { importTarGzipToOPFS, loadFromOPFS, initOPFSButton } from './js/backup/opfs-import.js';
import { renderTagTaxonomy } from './js/ui/render-tag-taxonmy.js';
import { sortAppStateFiles } from './js/services/file-object-sort.js';
import { appState, FILE_PROPERTIES } from './js/services/store.js';
import { initSortSelect, populateSortSelect } from './js/ui/ui-elements-load/sort-select-load.js';
import { initViewSelect } from './js/ui/ui-elements-load/views-select-load.js';
import { renderFiles } from './js/ui/ui-functions-render/a-render-all-files.js';
import { addActionHandlers } from './js/ui/event-listeners-add.js';

window.appState = appState; // exposed for debugging and tests

document.addEventListener('DOMContentLoaded', function () {

    document.querySelector('[data-click-loadfiles]').addEventListener('click', () => loadAndProcess(loadFileHandles));
    document.querySelector('[data-click-loadfolder]').addEventListener('click', () => loadAndProcess(loadDirectoryFileHandles));
    document.querySelector('[data-click-loadopfs]').addEventListener('click', () => loadAndProcess(loadFromOPFS));

    document.querySelector('[data-click-importtartoopfs]').addEventListener('click', () => {
        importTarGzipToOPFS(() => {
            postLoad();
            document.getElementById('btn-load-opfs').disabled = false;
        });
    });

    initViewSelect();
    initSortSelect();
    initOPFSButton();

    const searchbox = document.getElementById('searchbox');
    const searchmode = appState.search.depth.searchMode;
    searchbox.placeholder = appState.search.depth.prompt[searchmode];

    addActionHandlers();

});

/**
 * Shared post-load steps: tag taxonomy, sort, UI refresh.
 * All loading paths run this after populating appState.
 */
function postLoad() {
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
    await loaderFn();
    postLoad();
}
