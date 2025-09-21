import { loadFile } from './file-processor.js';
import { getById } from './dom.js';

const fileInput = getById('fileInput');
fileInput.addEventListener('change', () => {
    loadFile(fileInput.files);
});
