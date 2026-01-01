import { loadFileHandles } from './js/src/services/file-handler.js';
import { renderTagTaxonomy } from './js/src/ui/render-tag-taxonmy.js';
import { sortAppStateFiles } from './js/src/services/file-object-sort.js';
import { appState } from './js/src/services/store.js';
import { renderData } from './js/src/ui/ui-functions-render/render-all-files.js';
import { addActionHandlers } from './js/src/ui/event-listeners-add.js';
import { VIEWS } from './js/src/constants.js';

document.addEventListener('DOMContentLoaded', function() {

    const loadFilesButton = document.querySelector('[data-click-loadfiles]');
    loadFilesButton.addEventListener('click', function() {
        conductor();
    });

    populateViewSelect();

});

function populateViewSelect() {
    const viewSelectElem = document.querySelector('[data-action="view-select"]');

    for (const key in VIEWS) {
        const option = document.createElement('option');
        option.value = VIEWS[key];
        option.textContent = VIEWS[key];
        viewSelectElem.appendChild(option);
    }

    // Set the initial value from appState
    viewSelectElem.value = appState.viewState;
}

async function conductor() {
    await loadData();
    renderData();
    addActionHandlers();
}

async function loadData() {
    await loadFileHandles();
    renderTagTaxonomy();
    sortAppStateFiles("filename", "string", "desc");
}
