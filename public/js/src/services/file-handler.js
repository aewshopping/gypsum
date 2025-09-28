import { appState } from './store.js';

async function getFileDataAndMetadata(handle) {
    const file = await handle.getFile();
    return {
    handle: handle,
    name: file.name,
    sizeInBytes: file.size,
    lastModified: new Date(file.lastModified)
    };
}

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

    // Map file handles to promises the function above
    const filePromises = fileHandles.map(getFileDataAndMetadata);

    // Await all promises to resolve concurrently (quicker than loading one by one)
    const filesWithMetadata = await Promise.all(filePromises);

    appState.myFiles = filesWithMetadata;

    console.log(`Saved metadata for ${appState.myFiles.length} files.`);

}