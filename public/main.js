import { loadFile } from './js/src/services/file-reader.js';
import { getById } from './js/src/ui/dom-elements.js';
import { loadFileHandles } from './js/src/services/file-handler.js';
import { renderTagTaxonomy } from './js/src/ui/new/render-tag-taxonmy.js';
import { renderFileList } from './js/src/ui/new/render-file-list.js';

const fileInput = getById('fileInput');
fileInput.addEventListener('change', () => {
    loadFile(fileInput.files);
});

const button = document.getElementById('btn_loadFileHandles');
button.addEventListener('click', conductor);

async function conductor() {
    await loadFileHandles();
    renderTagTaxonomy();
    renderFileList();
}   