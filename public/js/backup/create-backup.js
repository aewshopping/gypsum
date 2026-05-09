import { createTarGzipStream } from './nanotar.js';
import { appState } from '../services/store.js';
import { SAVE_FOLDER } from '../constants.js';

/**
 * Recursively collect .txt and .md files from a directory handle.
 * Mirrors the traversal pattern in directory-handler.js: skips dot-directories.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} path
 * @returns {Promise<Array<{handle: FileSystemFileHandle, filepath: string}>>}
 */
async function collectContentFiles(dirHandle, path = '') {
    const results = [];
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
            if (entry.name.endsWith('.txt') || entry.name.endsWith('.md')) {
                const filepath = path ? `${path}/${entry.name}` : entry.name;
                results.push({ handle: entry, filepath });
            }
        } else if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
            const subPath = path ? `${path}/${entry.name}` : entry.name;
            const subResults = await collectContentFiles(entry, subPath);
            results.push(...subResults);
        }
    }
    return results;
}

/**
 * Collect all files from the .gypsum directory.
 * Returns [] if the folder does not exist yet — the backup still proceeds without it.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @returns {Promise<Array<{handle: FileSystemFileHandle, filepath: string}>>}
 */
async function collectGypsumFiles(dirHandle) {
    let gypsumDir;
    try {
        gypsumDir = await dirHandle.getDirectoryHandle(SAVE_FOLDER, { create: false });
    } catch {
        return [];
    }
    const results = [];
    for await (const entry of gypsumDir.values()) {
        if (entry.kind === 'file') {
            results.push({ handle: entry, filepath: `${SAVE_FOLDER}/${entry.name}` });
        }
    }
    return results;
}

/**
 * Convert file handle entries to the { name, data } format nanotar expects.
 * @param {Array<{handle: FileSystemFileHandle, filepath: string}>} fileEntries
 * @returns {Promise<Array<{name: string, data: Uint8Array}>>}
 */
async function toTarEntries(fileEntries) {
    return Promise.all(
        fileEntries.map(async ({ handle, filepath }) => ({
            name: filepath,
            data: new Uint8Array(await (await handle.getFile()).arrayBuffer()),
        }))
    );
}

/**
 * @returns {string} compact local timestamp, e.g. "20260509-143022"
 */
function buildTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Collect, compress, and download a .tar.gz of directory contents.
 * When includeGypsum is true, also includes all files in the .gypsum folder.
 * No-ops silently if no directory folder is loaded (dirHandle is null).
 * @param {boolean} includeGypsum
 * @returns {Promise<void>}
 */
export async function downloadBackup(includeGypsum) {
    const { dirHandle } = appState;
    if (!dirHandle) return;

    const contentEntries = await collectContentFiles(dirHandle);
    const gypsumEntries = includeGypsum ? await collectGypsumFiles(dirHandle) : [];
    const tarEntries = await toTarEntries([...contentEntries, ...gypsumEntries]);

    const stream = createTarGzipStream(tarEntries);
    const blob = await new Response(stream).blob();

    const label = includeGypsum ? 'full' : 'content';
    triggerDownload(blob, `gypsum-${label}-${buildTimestamp()}.tar.gz`);
}
