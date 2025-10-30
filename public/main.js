import { loadFileHandles } from './js/src/services/file-handler.js';
import { renderTagTaxonomy } from './js/src/ui/new/render-tag-taxonmy.js';
import { renderFileList_grid } from './js/src/ui/new/render-file-list-grid.js';
import { addClickHandlers } from './js/src/ui/new/event-listeners-add.js';
import { sortAppStateFiles } from './js/src/services/file-object-sort.js';

document.addEventListener('DOMContentLoaded', function() {
    const loadFilesButton = document.querySelector('[data-click-loadfiles]');
    loadFilesButton.addEventListener('click', function() {
        conductor();
    });
});


async function conductor() {
    await loadFileHandles();
    renderTagTaxonomy();
    sortAppStateFiles("filename", "string", "desc");
    renderFileList_grid();
    addClickHandlers();
}