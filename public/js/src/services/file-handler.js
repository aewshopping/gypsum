import { appState } from './store.js';
import { getFileDataAndMetadata } from './file-parsing/file-info.js';
import { getUniqueTagsSortedWithCount } from './file-parsing/tag-count.js';
import { createParentChildTagStructure } from './file-parsing/tag-taxon.js';
import { updateMyFileProperties } from './file-props.js';

export async function loadFileHandles() {

    console.log("working");

    const fileHandles = await window.showOpenFilePicker({
    multiple: true,
    types: [
        {
        description: 'Text Files',
        accept: { 'text/plain': ['.txt'], 'text/markdown': ['.md'] }
        },
    ],
    });

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
    updateMyFileProperties(appState.myFiles[0]); // // to build table view, with columns showing file properties

    console.log(`Saved metadata for ${appState.myFiles.length} files.`);
    document.getElementById('fileCountElement').innerText = appState.myFiles.length;

    appState.myTags = getUniqueTagsSortedWithCount(appState.myFiles);

    appState.myTaxonomy = createParentChildTagStructure(appState.myFiles, appState.myTags);

}