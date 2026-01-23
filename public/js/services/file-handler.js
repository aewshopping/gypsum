import { appState, TABLE_VIEW_COLUMNS } from './store.js';
import { getFileDataAndMetadata } from './file-parsing/file-info.js';
import { getUniqueTagsSortedWithCount } from './file-parsing/tag-count.js';
import { createParentChildTagStructure } from './file-parsing/tag-taxon.js';
import { updateMyFilesProperties } from './file-props.js';

/**
 * Asynchronously opens a file picker for `.txt` and `.md` files, reads metadata for selected files,
 * stores file handles and file metadata in `appState`, computes tags/taxonomy, updates the UI file count,
 * and initializes the file properties table for the first file.
 *
 * Side effects: mutates `appState`, updates the DOM (`#fileCountElement`), and logs to the console.
 *
 * @async
 * @function loadFileHandles
 * @returns {Promise<void>} Resolves when files are loaded and app state/UI are updated.
 */

export async function loadFileHandles() {

    console.log("working");

    // delete table properties object in preparation for new file props (this gets built once per data load then used to populate myFilesProperties)
    TABLE_VIEW_COLUMNS.current_props.length = 0;
    // build once per data load then used to generate property values in different views
    appState.myFilesProperties.clear();

    const fileHandles = await window.showOpenFilePicker({
    multiple: true,
    types: [
        {
        description: 'Text Files',
        accept: { 'text/plain': ['.txt'], 'text/markdown': ['.md'] }
        },
    ],
    });

    const startTime = performance.now();

    // Map file handles to promises from the function above
    const filePromises = fileHandles.map((handle, index) => getFileDataAndMetadata(handle, index));

    // Await all promises to resolve concurrently (quicker than loading one by one)
    const filesWithMetadata = await Promise.all(filePromises);

    const fileHandleMap = filesWithMetadata.reduce((map, fileObject) => {
        // fileObject.filename is the key
        // fileObject.handle is the value
        map.set(fileObject.filename, fileObject.handle); 
        return map;
    }, new Map());

    appState.myFileHandlesMap = fileHandleMap; // to allow later speedy loookup of file using filename
    appState.myFiles = filesWithMetadata;
    updateMyFilesProperties(appState.myFiles[0], 1); // // to build table view, with columns showing file properties

    appState.myTags = getUniqueTagsSortedWithCount(appState.myFiles);

    appState.myTaxonomy = createParentChildTagStructure(appState.myFiles, appState.myTags);

    const endTime = performance.now();
    const timeTaken = endTime - startTime; 
    const durationSec = (timeTaken / 1000).toFixed(2);

    const fileCount = appState.myFiles.length;
    console.log(`Saved metadata for ${fileCount} files.`);
    document.getElementById('fileCountElement').textContent = `${fileCount} files loaded, in ${durationSec} seconds`;

}