import { parseTarGzip } from './nanotar.js';
import { showWarningModal } from '../ui/ui-functions-click/warning-modal.js';
import { appState, TABLE_VIEW_COLUMNS } from '../services/store.js';
import { getFilesRecursive } from '../services/directory-handler.js';
import { getFileDataAndMetadata } from '../services/file-parsing/file-info.js';
import { buildParentMap } from '../services/file-parsing/tag-taxon.js';
import { invalidateTagCache } from '../autocomplete/tag-cache.js';
import { updateMyFilesProperties } from '../services/file-props.js';

/**
 * Returns true if OPFS already contains any .txt/.md files or non-hidden subdirectories.
 * @param {FileSystemDirectoryHandle} opfsRoot
 * @returns {Promise<boolean>}
 */
async function hasOPFSContent(opfsRoot) {
    for await (const entry of opfsRoot.values()) {
        if (entry.kind === 'file' && (entry.name.endsWith('.txt') || entry.name.endsWith('.md'))) return true;
        if (entry.kind === 'directory' && !entry.name.startsWith('.')) return true;
    }
    return false;
}

/**
 * Writes .txt and .md entries from a parsed tar archive into OPFS, preserving paths.
 * @param {Array<{name: string, type: string, text: string}>} entries
 * @param {FileSystemDirectoryHandle} opfsRoot
 * @returns {Promise<void>}
 */
async function writeFilesToOPFS(entries, opfsRoot) {
    for (const entry of entries) {
        if (entry.type !== 'file') continue;
        if (!entry.name.endsWith('.txt') && !entry.name.endsWith('.md')) continue;
        const parts = entry.name.split('/');
        const filename = parts.pop();
        let dir = opfsRoot;
        for (const part of parts) {
            dir = await dir.getDirectoryHandle(part, { create: true });
        }
        const fileHandle = await dir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(entry.text);
        await writable.close();
    }
}

/**
 * Reads all .txt/.md files from OPFS and populates appState. Mirrors loadDirectoryFileHandles().
 * @param {FileSystemDirectoryHandle} opfsRoot
 * @returns {Promise<void>}
 */
async function populateAppStateFromOPFS(opfsRoot) {
    TABLE_VIEW_COLUMNS.current_props.length = 0;
    appState.myFilesProperties.clear();
    appState.dirHandle = opfsRoot;
    document.getElementById('btn-new-note').disabled = false;

    const startTime = performance.now();

    const fileEntries = await getFilesRecursive(opfsRoot);
    const filePromises = fileEntries.map(({ handle, filepath }, index) =>
        getFileDataAndMetadata(handle, index).then(fileObj => ({ ...fileObj, filepath, id: filepath }))
    );
    const filesWithMetadata = await Promise.all(filePromises);

    appState.myFileHandlesMap = filesWithMetadata.reduce((map, fileObject) => {
        map.set(fileObject.id, fileObject.handle);
        return map;
    }, new Map());
    appState.myFiles = filesWithMetadata;
    updateMyFilesProperties(appState.myFiles[0], 1);
    appState.myParentMap = buildParentMap(appState.myFiles);
    invalidateTagCache();

    const durationSec = ((performance.now() - startTime) / 1000).toFixed(2);
    const fileCount = appState.myFiles.length;
    document.getElementById('fileCountElement').textContent = `${fileCount} files loaded, in ${durationSec} seconds`;
}

/**
 * Opens a file picker for a .tar.gz backup, extracts it into OPFS, then loads from OPFS.
 * Shows a warning modal before overwriting only if OPFS already contains files.
 * @param {Function} onComplete - Called after files are loaded into appState.
 * @returns {Promise<void>}
 */
export async function importTarGzipToOPFS(onComplete) {
    const [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: 'Gypsum backup', accept: { 'application/gzip': ['.gz'] } }],
    });
    const file = await fileHandle.getFile();
    const entries = await parseTarGzip(await file.arrayBuffer());
    const opfsRoot = await navigator.storage.getDirectory();

    async function proceed() {
        await writeFilesToOPFS(entries, opfsRoot);
        await populateAppStateFromOPFS(opfsRoot);
        onComplete();
    }

    if (await hasOPFSContent(opfsRoot)) {
        showWarningModal('OPFS already contains imported files. Overwrite them?', 'Overwrite', 'Cancel', proceed);
    } else {
        await proceed();
    }
}

/**
 * Loads files already in OPFS into appState without re-importing. No-ops if OPFS is empty.
 * @param {Function} onComplete - Called after files are loaded into appState.
 * @returns {Promise<void>}
 */
export async function loadFromOPFS(onComplete) {
    const opfsRoot = await navigator.storage.getDirectory();
    if (!(await hasOPFSContent(opfsRoot))) return;
    await populateAppStateFromOPFS(opfsRoot);
    onComplete();
}

/**
 * Checks OPFS on startup and enables the "Open OPFS" button if content is present.
 * @returns {Promise<void>}
 */
export async function initOPFSButton() {
    const opfsRoot = await navigator.storage.getDirectory();
    if (await hasOPFSContent(opfsRoot)) {
        document.getElementById('btn-load-opfs').disabled = false;
    }
}
