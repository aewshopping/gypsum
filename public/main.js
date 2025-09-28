import { loadFile } from './js/src/services/file-reader.js';
import { getById } from './js/src/ui/dom-elements.js';
import { loadFileHandles } from './js/src/services/file-handler.js';

const fileInput = getById('fileInput');
fileInput.addEventListener('change', () => {
    loadFile(fileInput.files);
});

const button = document.getElementById('btn_loadFileHandles');
button.addEventListener('click', loadFileHandles);
