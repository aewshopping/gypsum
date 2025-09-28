import { loadFile } from './js/src/services/file-reader.js';
import { getById } from './js/src/ui/dom-elements.js';

const fileInput = getById('fileInput');
fileInput.addEventListener('change', () => {
    loadFile(fileInput.files);
});
