import { loadFile } from './js/src/services/file-reader.js';
import { getById } from './js/src/ui/dom-elements.js';
import { loadFileHandles } from './js/src/services/file-handler.js';
import { renderTagTaxonomy } from './js/src/ui/new/render-tag-taxonmy.js';
import { renderFileList_details } from './js/src/ui/new/render-file-list-details.js';
import { renderFileList_grid } from './js/src/ui/new/render-file-list-grid.js';
import { addClickHandlers } from './js/src/ui/new/event-listeners-add.js';

const fileInput = getById('fileInput');
fileInput.addEventListener('change', () => {
    loadFile(fileInput.files);
});

const button = document.getElementById('btn_loadFileHandles');
button.addEventListener('click', conductor);

async function conductor() {
    await loadFileHandles();
    renderTagTaxonomy();
    renderFileList_grid();
    addClickHandlers();
}   