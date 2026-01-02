
import { appState } from './store.js';
import { getFileDataAndMetadata, getFileDataAndMetadataFromFile } from './file-parsing/file-info.js';
import { getUniqueTagsSortedWithCount } from './file-parsing/tag-count.js';
import { createParentChildTagStructure } from './file-parsing/tag-taxon.js';
import { updateMyFileProperties } from './file-props.js';

export async function loadFileHandles() {
    const fileHandles = await window.showOpenFilePicker({
        multiple: true,
        types: [{
            description: 'Text Files',
            accept: {
                'text/plain': ['.txt'],
                'text/markdown': ['.md']
            }
        }, ],
    });

    await loadFiles(fileHandles);
}

export async function loadFiles(filesOrHandles) {
    const filePromises = filesOrHandles.map((fileOrHandle, index) => {
        if (fileOrHandle.getFile) { // It's a FileSystemFileHandle
            return getFileDataAndMetadata(fileOrHandle, index);
        } else { // It's a File object
            return getFileDataAndMetadataFromFile(fileOrHandle, index);
        }
    });
    const filesWithMetadata = await Promise.all(filePromises);

    const fileHandleMap = filesWithMetadata.reduce((map, fileObject) => {
        if(fileObject.handle) {
            map.set(fileObject.filename, fileObject.handle);
        }
        return map;
    }, new Map());

    appState.myFileHandlesMap = fileHandleMap;
    appState.myFiles = filesWithMetadata;

    // Set show to true for all files
    appState.myFiles.forEach(file => {
        file.show = true;
    });

    // Update properties for all files
    appState.myFiles.forEach(file => {
        updateMyFileProperties(file, 1);
    });

    document.getElementById('fileCountElement').innerText = appState.myFiles.length;
    appState.myTags = getUniqueTagsSortedWithCount(appState.myFiles);
    appState.myTaxonomy = createParentChildTagStructure(appState.myFiles, appState.myTags);
}
