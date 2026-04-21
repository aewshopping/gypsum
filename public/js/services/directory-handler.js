import { appState, TABLE_VIEW_COLUMNS } from './store.js';
import { getFileDataAndMetadata } from './file-parsing/file-info.js';
import { buildParentMap } from './file-parsing/tag-taxon.js';
import { updateMyFilesProperties } from './file-props.js';

/**
 * Recursively collects all .txt and .md file handles from a directory and its subdirectories.
 * @param {FileSystemDirectoryHandle} dirHandle - The directory to search.
 * @param {string} path - The accumulated relative path prefix for this level.
 * @returns {Promise<Array<{handle: FileSystemFileHandle, filepath: string}>>}
 */
async function getFilesRecursive(dirHandle, path = '') {
    const results = [];
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
            if (entry.name.endsWith('.txt') || entry.name.endsWith('.md')) {
                const filepath = path ? `${path}/${entry.name}` : entry.name;
                results.push({ handle: entry, filepath });
            }
        } else if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
            const subPath = path ? `${path}/${entry.name}` : entry.name;
            const subResults = await getFilesRecursive(entry, subPath);
            results.push(...subResults);
        }
    }
    return results;
}

/**
 * Opens a read-only directory picker, recursively collects all .txt and .md files,
 * processes their metadata, and populates appState.
 * @async
 * @function loadDirectoryFileHandles
 * @returns {Promise<void>}
 */
export async function loadDirectoryFileHandles() {

    TABLE_VIEW_COLUMNS.current_props.length = 0;
    appState.myFilesProperties.clear();

    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    appState.dirHandle = dirHandle;

    const startTime = performance.now();

    const fileEntries = await getFilesRecursive(dirHandle);

    const filePromises = fileEntries.map(({ handle, filepath }, index) =>
        getFileDataAndMetadata(handle, index).then(fileObj => ({ ...fileObj, filepath, id: filepath }))
    );

    const filesWithMetadata = await Promise.all(filePromises);

    const fileHandleMap = filesWithMetadata.reduce((map, fileObject) => {
        map.set(fileObject.id, fileObject.handle);
        return map;
    }, new Map());

    appState.myFileHandlesMap = fileHandleMap;
    appState.myFiles = filesWithMetadata;
    updateMyFilesProperties(appState.myFiles[0], 1);

    appState.myParentMap = buildParentMap(appState.myFiles);

    const endTime = performance.now();
    const durationSec = ((endTime - startTime) / 1000).toFixed(2);

    const fileCount = appState.myFiles.length;
    console.log(`Saved metadata for ${fileCount} files.`);
    document.getElementById('fileCountElement').textContent = `${fileCount} files loaded, in ${durationSec} seconds`;

}
