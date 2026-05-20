import { parseTarGzip } from './nanotar.js';
import { showWarningModal } from '../ui/ui-functions-click/warning-modal.js';
import { appState, TABLE_VIEW_COLUMNS } from '../services/store.js';
import { getFilesRecursive } from '../services/directory-handler.js';
import { getFileDataAndMetadata } from '../services/file-parsing/file-info.js';
import { buildParentMap } from '../services/file-parsing/tag-taxon.js';
import { invalidateTagCache } from '../autocomplete/tag-cache.js';
import { updateMyFilesProperties } from '../services/file-props.js';
import { PROGRESS_STEP_SIZE } from '../constants.js';

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
 * Removes all entries from OPFS root, including subdirectories.
 * @param {FileSystemDirectoryHandle} opfsRoot
 * @returns {Promise<void>}
 */
async function clearOPFS(opfsRoot) {
    for await (const name of opfsRoot.keys()) {
        await opfsRoot.removeEntry(name, { recursive: true });
    }
}

/**
 * Writes all file entries from a parsed tar archive into OPFS, preserving paths.
 * @param {Array<{name: string, type: string, text: string}>} entries
 * @param {FileSystemDirectoryHandle} opfsRoot
 * @returns {Promise<void>}
 */
async function writeFilesToOPFS(entries, opfsRoot, n, total) {
    const fileCountEl = document.getElementById('fileCountElement');
    const increment = n * 100 / total;
    let count = 0;
    let pct = 0;
    fileCountEl.classList.remove('load-complete');
    fileCountEl.textContent = `unpacking: ${total}`;
    fileCountEl.style.setProperty('--load-pct', 0);
    for (const entry of entries) {
        if (entry.type !== 'file') continue;
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
        if (++count % n === 0) fileCountEl.style.setProperty('--load-pct', Math.round(Math.min(100, pct += increment)));
        // if (++count % n === 0) fileCountEl.textContent = `unpacking: ${Math.round(Math.min(100, pct += increment))}% of ${total}`;
    }
}

/**
 * Reads all .txt/.md files from OPFS and populates appState. Mirrors loadDirectoryFileHandles().
 * @param {FileSystemDirectoryHandle} opfsRoot
 * @param {number|null} outerStartTime - performance.now() timestamp from before unpacking, if available.
 * @returns {Promise<void>}
 */
async function populateAppStateFromOPFS(opfsRoot, outerStartTime = null, n = null) {
    TABLE_VIEW_COLUMNS.current_props.length = 0;
    appState.myFilesProperties.clear();
    appState.dirHandle = opfsRoot;
    document.getElementById('btn-new-note').disabled = false;

    const startTime = performance.now();

    const fileEntries = await getFilesRecursive(opfsRoot);
    const total = fileEntries.length;
    const updateN = n ?? Math.max(1, Math.ceil(total * PROGRESS_STEP_SIZE / 100));
    const increment = updateN * 100 / total;
    const fileCountEl = document.getElementById('fileCountElement');
    const filesWithMetadata = [];
    let pct = 0;
    fileCountEl.classList.remove('load-complete');
    fileCountEl.textContent = `files: ${total}`;
    fileCountEl.style.setProperty('--load-pct', 0);
    for (let i = 0; i < total; i++) {
        const { handle, filepath } = fileEntries[i];
        const fileObj = await getFileDataAndMetadata(handle, i);
        if (i % updateN === 0) fileCountEl.style.setProperty('--load-pct', Math.round(Math.min(100, pct += increment)));
        // if (i % updateN === 0) fileCountEl.textContent = `files: ${Math.round(Math.min(100, pct += increment))}% of ${total}`;
        filesWithMetadata.push({ ...fileObj, filepath, id: filepath });
    }

    appState.myFileHandlesMap = filesWithMetadata.reduce((map, fileObject) => {
        map.set(fileObject.id, fileObject.handle);
        return map;
    }, new Map());
    appState.myFiles = filesWithMetadata;
    updateMyFilesProperties(appState.myFiles[0], 1);
    appState.myParentMap = buildParentMap(appState.myFiles);
    invalidateTagCache();

    const endTime = performance.now();
    const loadDurationSec = ((endTime - startTime) / 1000).toFixed(2); // pure file load; available for future console logging
    const displayDuration = outerStartTime ? ((endTime - outerStartTime) / 1000).toFixed(2) : loadDurationSec;
    const fileCount = appState.myFiles.length;
    fileCountEl.classList.add('load-complete');
    document.getElementById('fileCountElement').textContent = `files: ${fileCount} | ${displayDuration}s | opfs`;
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
    const importStartTime = performance.now();
    const file = await fileHandle.getFile();
    const entries = await parseTarGzip(await file.arrayBuffer());
    const opfsRoot = await navigator.storage.getDirectory();

    async function proceed() {
        const total = entries.filter(e => e.type === 'file').length;
        const n = Math.max(1, Math.ceil(total * PROGRESS_STEP_SIZE / 100));
        await writeFilesToOPFS(entries, opfsRoot, n, total);
        await populateAppStateFromOPFS(opfsRoot, importStartTime, n);
        onComplete();
    }

    if (await hasOPFSContent(opfsRoot)) {
        showWarningModal('OPFS already contains imported files. Overwrite them?', 'Overwrite', 'Cancel', async () => {
            await clearOPFS(opfsRoot);
            await proceed();
        });
    } else {
        await proceed();
    }
}

/**
 * Loads files already in OPFS into appState without re-importing. No-ops if OPFS is empty.
 * @returns {Promise<void>}
 */
export async function loadFromOPFS() {
    const opfsRoot = await navigator.storage.getDirectory();
    if (!(await hasOPFSContent(opfsRoot))) return;
    await populateAppStateFromOPFS(opfsRoot);
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
