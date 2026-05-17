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

    document.querySelector('[data-click-loadfolder]').addEventListener('click', () => loadAndProcess(loadDirectoryFileHandles));
    document.querySelector('[data-click-loadopfs]').addEventListener('click', () => loadAndProcess(loadFromOPFS));

    document.querySelector('[data-click-importtartoopfs]').addEventListener('click', async () => {
        const btn = document.getElementById('btn_loadDirectoryHandles');
        btn.classList.add('loading');
        const removeLoading = () => btn.classList.remove('loading');
        try {
            await importTarGzipToOPFS(() => {
                postLoad();
                document.getElementById('btn-load-opfs').disabled = false;
                removeLoading();
            });
        } catch {
            removeLoading();
        }
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
    const btn = document.getElementById('btn_loadDirectoryHandles');
    btn.classList.add('loading');
    try {
        await loaderFn();
        postLoad();
    } finally {
        btn.classList.remove('loading');
    }
}
