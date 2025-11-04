import { loadFileHandles } from './js/src/services/file-handler.js';
import { renderTagTaxonomy } from './js/src/ui/render-tag-taxonmy.js';
import { renderFileList_grid } from './js/src/ui/render-file-list-grid.js';
import { addClickHandlers } from './js/src/ui/event-listeners-add.js';
import { sortAppStateFiles } from './js/src/services/file-object-sort.js';
import { renderFileList_table } from './js/src/ui/render-file-list-table.js';

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
//    renderFileList_grid();
    renderFileList_table();
    addClickHandlers();
}