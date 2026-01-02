import { loadFileHandles, loadFiles } from './js/services/file-handler.js';
import { renderTagTaxonomy } from './js/ui/render-tag-taxonmy.js';
import { sortAppStateFiles } from './js/services/file-object-sort.js';
import { appState, FILE_PROPERTIES } from './js/services/store.js';
import { renderData } from './js/ui/ui-functions-render/render-all-files.js';
import { addActionHandlers } from './js/ui/event-listeners-add.js';
import { VIEWS } from './js/constants.js';

document.addEventListener('DOMContentLoaded', function () {

    const loadFilesButton = document.querySelector('[data-click-loadfiles]');
    loadFilesButton.addEventListener('click', function () {
        conductorWithFilePicker();
    });

    const fileInputElement = document.getElementById('file-input');
    fileInputElement.addEventListener('change', function (event) {
        const files = event.target.files;
        conductorWithFiles(Array.from(files));
    });

    const viewSelectElem = document.querySelector('[data-action="view-select"]');

    for (const key in VIEWS) {
        const option = document.createElement('option');
        option.value = VIEWS[key].value;
        option.textContent = VIEWS[key].label;
        viewSelectElem.appendChild(option);
    }

    viewSelectElem.value = appState.viewState;
    addActionHandlers();

});

async function conductorWithFilePicker() {
    await loadDataWithFilePicker();
    renderData();
    addActionHandlers();
}

async function conductorWithFiles(files) {
    await loadDataWithFiles(files);
    renderData();
    addActionHandlers();
}

async function loadDataWithFilePicker() {
    await loadFileHandles();
    commonPostLoad();
}

async function loadDataWithFiles(files) {
    await loadFiles(files);
    commonPostLoad();
}

function commonPostLoad() {
    renderTagTaxonomy();

    const sortProp = appState.sortState.property;
    const sortType = FILE_PROPERTIES[sortProp].type;
    const sortDirection = appState.sortState.direction;

    sortAppStateFiles(sortProp, sortType, sortDirection);
}