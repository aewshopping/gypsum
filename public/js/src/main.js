import { loadFile } from './services/file-reader.js';
import { getById } from './ui/dom-elements.js';

const fileInput = getById('fileInput');
fileInput.addEventListener('change', () => {
    loadFile(fileInput.files);
});
