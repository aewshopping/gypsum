import { loadFileHandles } from './js/services/file-handler.js';
import { loadDirectoryFileHandles } from './js/services/directory-handler.js';
import { renderTagTaxonomy } from './js/ui/render-tag-taxonmy.js';
import { sortAppStateFiles } from './js/services/file-object-sort.js';
import { appState, FILE_PROPERTIES, TABLE_VIEW_COLUMNS } from './js/services/store.js';
import { renderFiles } from './js/ui/ui-functions-render/a-render-all-files.js';
import { addActionHandlers } from './js/ui/event-listeners-add.js';
import { VIEWS } from './js/constants.js';

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

    const viewSelectElem = document.querySelector('[data-action="view-select"]');

    for (const key in VIEWS) {
        const option = document.createElement('option');
        option.value = VIEWS[key].value;
        option.textContent = VIEWS[key].label;
        viewSelectElem.appendChild(option);
    }

    viewSelectElem.value = appState.viewState;

    const sortSelectElem = document.querySelector('[data-action="sort-select"]');
    const defaultSortProp = appState.sortState.property;
    const defaultOption = document.createElement('option');
    defaultOption.value = defaultSortProp;
    defaultOption.textContent = FILE_PROPERTIES.get(defaultSortProp)?.label ?? defaultSortProp;
    sortSelectElem.appendChild(defaultOption);
    sortSelectElem.value = defaultSortProp;

    const directionCheckbox = document.querySelector('[data-action="sort-direction-toggle"]');
    directionCheckbox.checked = appState.sortState.direction === 'asc';

    const searchbox = document.getElementById("searchbox");
    const searchmode = appState.search.depth.searchMode;
    searchbox.placeholder = appState.search.depth.prompt[searchmode];    

    addActionHandlers();

});

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

/**
 * Populates the sort-select dropdown with the properties found in the loaded files,
 * and syncs the sort-direction checkbox to match the current sort state.
 * @returns {void}
 */
function populateSortSelect() {
    const sortSelectElem = document.querySelector('[data-action="sort-select"]');
    sortSelectElem.innerHTML = '';

    const entries = [...appState.myFilesProperties.entries()]
        .filter(([key]) => !TABLE_VIEW_COLUMNS.hidden_always.includes(key))
        .sort(([, a], [, b]) => (a.display_order ?? 99) - (b.display_order ?? 99));

    for (const [key, props] of entries) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = props.label ?? key;
        sortSelectElem.appendChild(option);
    }

    sortSelectElem.value = appState.sortState.property;

    const directionCheckbox = document.querySelector('[data-action="sort-direction-toggle"]');
    directionCheckbox.checked = appState.sortState.direction === 'asc';
}