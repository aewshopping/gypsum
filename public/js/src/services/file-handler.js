import { appState } from './store.js';
import { getFileDataAndMetadata } from './file-parsing/file-info.js';
import { getUniqueTagsSortedWithCount } from './file-parsing/tag-count.js';
import { createParentChildTagStructure } from './file-parsing/tag-taxon.js';

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

    appState.myTags = getUniqueTagsSortedWithCount(appState.myFiles);

    appState.myTaxonomy = createParentChildTagStructure(appState.myFiles, appState.myTags);

    console.log(appState.myTaxonomy);
}