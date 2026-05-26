import { appState, TABLE_VIEW_COLUMNS } from './store.js';
import { getFileDataAndMetadata } from './file-parsing/file-info.js';
import { buildParentMap } from './file-parsing/tag-taxon.js';
import { invalidateTagCache } from '../autocomplete/tag-cache.js';
import { updateMyFilesProperties } from './file-props.js';
import { PROGRESS_STEP_SIZE } from '../constants.js';

/**
 * Recursively collects all .txt and .md file handles from a directory and its subdirectories.
 * @param {FileSystemDirectoryHandle} dirHandle - The directory to search.
 * @param {string} path - The accumulated relative path prefix for this level.
 * @returns {Promise<Array<{handle: FileSystemFileHandle, filepath: string}>>}
 */
export async function getFilesRecursive(dirHandle, path = '') {
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
 * @param {Function|null} onPickerResolved - Called after the picker resolves, before file loading begins.
 * @returns {Promise<void>}
 */
export async function loadDirectoryFileHandles(onPickerResolved = null) {

    TABLE_VIEW_COLUMNS.current_props.length = 0;
    appState.myFilesProperties.clear();

    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    appState.dirHandle = dirHandle;
    document.getElementById('btn-new-note').disabled = false;
    onPickerResolved?.();

    const startTime = performance.now();

    const fileEntries = await getFilesRecursive(dirHandle);

    const fileCountEl = document.getElementById('fileCountElement');
    const filesWithMetadata = [];
    const total = fileEntries.length;
    const n = Math.max(1, Math.ceil(total * PROGRESS_STEP_SIZE / 100));
    const increment = n * 100 / total;
    let pct = 0;
    fileCountEl.classList.add('loading');
    fileCountEl.textContent = `files: ${total}`;
    fileCountEl.style.setProperty('--load-pct', 0);
    for (let i = 0; i < total; i++) {
        const { handle, filepath } = fileEntries[i];
        const fileObj = await getFileDataAndMetadata(handle, i);
        if (i % n === 0) fileCountEl.style.setProperty('--load-pct', Math.round(Math.min(100, pct += increment)));
        // if (i % n === 0) fileCountEl.textContent = `files: ${Math.round(Math.min(100, pct += increment))}% of ${total}`;
        filesWithMetadata.push({ ...fileObj, filepath, id: filepath });
    }

    const fileHandleMap = filesWithMetadata.reduce((map, fileObject) => {
        map.set(fileObject.id, fileObject.handle);
        return map;
    }, new Map());

    appState.myFileHandlesMap = fileHandleMap;
    appState.myFiles = filesWithMetadata;
    updateMyFilesProperties(appState.myFiles[0], 1);

    appState.myParentMap = buildParentMap(appState.myFiles);
    invalidateTagCache();

    const endTime = performance.now();
    const durationSec = ((endTime - startTime) / 1000).toFixed(1);

    const fileCount = appState.myFiles.length;
    console.log(`Saved metadata for ${fileCount} files.`);
    fileCountEl.classList.remove('loading');
    fileCountEl.innerHTML = `files: ${fileCount} | ${durationSec}s`;
    setTimeout(() => {
        fileCountEl.innerHTML = `<span class="load-finished-msg">files: ${fileCount} | file system</span>`;
    }, 3000);

}
