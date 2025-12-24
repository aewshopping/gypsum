import { loadFileHandles } from './js/src/services/file-handler.js';
import { renderTagTaxonomy } from './js/src/ui/render-tag-taxonmy.js';
import { renderFileList_grid } from './js/src/ui/render-file-list-grid.js';
import { addActionHandlers } from './js/src/ui/event-listeners-add.js';
import { sortAppStateFiles } from './js/src/services/file-object-sort.js';
import { renderFileList_table } from './js/src/ui/render-file-list-table.js';
import { appState } from './js/src/services/store.js';

document.addEventListener('DOMContentLoaded', function() {
    const loadFilesButton = document.querySelector('[data-click-loadfiles]');
    loadFilesButton.addEventListener('click', function() {
        conductor();
    });
});

async function conductor() {
    await loadData();
    renderData();
}

async function loadData() {
    await loadFileHandles();
    renderTagTaxonomy();
    sortAppStateFiles("filename", "string", "desc");
}

export function renderData() {
    const myView = document.getElementById("view-select");
    renderSelected(myView);
    addActionHandlers();
}



// is there a better way to do this? Feels pretty hacky.
function renderSelected(element) {
    const outputElement = document.getElementById("output");
    const viewClasses = ['list-grid', 'list-table'];
    switch(element.value) {
        case 'cards':
            outputElement.classList.remove(...viewClasses);
            outputElement.classList.add('list-grid');
            renderFileList_grid();
            break;
        case 'table':
            outputElement.classList.remove(...viewClasses);
            outputElement.classList.add('list-table');
            renderFileList_table();
            break;
        default:
            outputElement.classList.remove(...viewClasses);
            outputElement.classList.add('list-grid');
            renderFileList_grid();
            break;
    }
}