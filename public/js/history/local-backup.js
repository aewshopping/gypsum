import { appState } from '../services/store.js';
import { BACKUP_FILENAME, SAVE_FOLDER } from '../constants.js';

const MAX_SNAPSHOTS_PER_FILE = 15;  // versions kept for any one file
const MAX_FILES = 200;              // files tracked, ranked by their newest snapshot

/**
 * Parses history.gypsum text into { lines, snapshots }.
 * Handles empty input and migrates the old flat-array format automatically.
 *
 * @param {string} text
 * @returns {{ lines: string[], snapshots: Array<{filepath:string, filename:string, timestamp:string, event:string, lineRefs:number[]}> }}
 */
function parseHistory(text) {
    if (!text.trim()) return { lines: [], snapshots: [] };
    let parsed;
    try { parsed = JSON.parse(text); } catch { return { lines: [], snapshots: [] }; }

    if (Array.isArray(parsed)) {
        // Migrate old format: each entry had a plain `content` string
        const lines = [];
        const lineIndex = new Map();
        const snapshots = parsed.map(entry => {
            const entryLines = entry.content.split(/\r?\n/);
            const lineRefs = entryLines.map(line => {
                if (!lineIndex.has(line)) { lineIndex.set(line, lines.length); lines.push(line); }
                return lineIndex.get(line);
            });
            return { filepath: entry.filepath, filename: entry.filename, timestamp: entry.timestamp, event: entry.event, lineRefs };
        });
        return { lines, snapshots };
    }

    return { lines: parsed.lines ?? [], snapshots: parsed.snapshots ?? [] };
}

/**
 * Identifies a file within the snapshot list. Neither part can contain a newline,
 * so joining on one cannot collide.
 * @param {{filepath: string, filename: string}} snapshot
 * @returns {string}
 */
function fileKey({ filepath, filename }) {
    return `${filepath}\n${filename}`;
}

/**
 * Rebuilds the line pool with only the lines the surviving snapshots still reference,
 * remapping every lineRef to its new index. Call after dropping any snapshot.
 * Snapshots are mutated in place; the compacted pool is returned.
 * @param {string[]} lines
 * @param {Array<{lineRefs:number[]}>} snapshots
 * @returns {string[]}
 */
function gcLines(lines, snapshots) {
    const usedSet = new Set(snapshots.flatMap(s => s.lineRefs));
    const oldToNew = new Map();
    const newLines = [];
    for (let i = 0; i < lines.length; i++) {
        if (usedSet.has(i)) { oldToNew.set(i, newLines.length); newLines.push(lines[i]); }
    }
    for (const s of snapshots) s.lineRefs = s.lineRefs.map(i => oldToNew.get(i));
    return newLines;
}

/**
 * Drops the oldest versions of one file once it holds more than MAX_SNAPSHOTS_PER_FILE.
 * Only the file just written can have crossed the cap, so only that one is checked.
 * @param {Array<object>} snapshots
 * @param {{filepath: string, filename: string}} snapshot - the file just written
 * @returns {Array<object>}
 */
function capVersionsForFile(snapshots, snapshot) {
    const key = fileKey(snapshot);
    const mine = snapshots.filter(s => fileKey(s) === key);
    if (mine.length <= MAX_SNAPSHOTS_PER_FILE) return snapshots;

    const drop = new Set(mine.slice(0, mine.length - MAX_SNAPSHOTS_PER_FILE));
    return snapshots.filter(s => !drop.has(s));
}

/**
 * Keeps history for the MAX_FILES most recently snapshotted files and drops every
 * version of the rest. A per-file cap alone does not bound the file: without this,
 * history for long-forgotten notes accumulates forever.
 * @param {Array<object>} snapshots
 * @returns {Array<object>}
 */
function capFileCount(snapshots) {
    const newestByFile = new Map();
    for (const s of snapshots) {
        const key = fileKey(s);
        const seen = newestByFile.get(key);
        if (seen === undefined || s.timestamp > seen) newestByFile.set(key, s.timestamp);
    }
    if (newestByFile.size <= MAX_FILES) return snapshots;

    // ISO 8601 timestamps sort correctly as plain strings
    const keep = new Set([...newestByFile.entries()]
        .sort((a, b) => b[1].localeCompare(a[1]))
        .slice(0, MAX_FILES)
        .map(([key]) => key));

    return snapshots.filter(s => keep.has(fileKey(s)));
}

/**
 * Serialises and writes the history file. Compact, not pretty-printed: indentation puts
 * every lineRef integer on its own line, which measures about 2.3x the size, and this
 * whole file is rewritten on every open and close.
 * @async
 * @param {FileSystemFileHandle} fileHandle
 * @param {string[]} lines
 * @param {Array<object>} snapshots
 * @returns {Promise<void>}
 */
async function writeHistory(fileHandle, lines, snapshots) {
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify({ lines, snapshots }));
    await writable.close();
}

/**
 * Appends a snapshot entry to history.gypsum in the loaded directory using
 * the line pool format — each unique line is stored once; snapshots reference
 * lines by index. Enforces both caps, then garbage-collects unreferenced lines.
 * Does nothing silently if no directory handle is available (file picker path),
 * or if the snapshot has no content.
 *
 * @async
 * @param {{ filepath: string, filename: string, content: string }} snapshot
 * @param {'open' | 'close'} event
 * @returns {Promise<number[]|null>} The lineRefs assigned to the snapshot, or null on failure.
 */
export async function saveBackupEntry(snapshot, event) {
    if (!appState.dirHandle) return;
    // An empty file has no state worth versioning — recording it would put a blank
    // v-1 at the head of every newly-created note's history.
    if (!snapshot.content.trim()) return null;

    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER, { create: true });
        const fileHandle = await gypsumDir.getFileHandle(BACKUP_FILENAME, { create: true });
        const existingText = await (await fileHandle.getFile()).text();

        let { lines, snapshots } = parseHistory(existingText);

        // Build index of existing lines for O(1) dedup lookup
        const lineIndex = new Map();
        lines.forEach((line, i) => lineIndex.set(line, i));

        // Convert incoming content to lineRefs, extending the pool with new lines
        const incomingLines = snapshot.content.split(/\r?\n/);
        const newRefs = incomingLines.map(line => {
            if (!lineIndex.has(line)) { lineIndex.set(line, lines.length); lines.push(line); }
            return lineIndex.get(line);
        });

        // Duplicate check: if last snapshot for this file has identical lineRefs, skip the write entirely.
        const lastForFile = [...snapshots].reverse().find(
            s => s.filename === snapshot.filename && s.filepath === snapshot.filepath
        );
        const isDuplicate = lastForFile &&
            lastForFile.lineRefs.length === newRefs.length &&
            lastForFile.lineRefs.every((v, i) => v === newRefs[i]);

        if (isDuplicate) {
            return newRefs;
        } else {
            snapshots.push({
                filepath: snapshot.filepath,
                filename: snapshot.filename,
                timestamp: new Date().toISOString(),
                event,
                lineRefs: newRefs,
            });
        }

        const beforeCaps = snapshots.length;
        snapshots = capVersionsForFile(snapshots, snapshot);
        snapshots = capFileCount(snapshots);
        if (snapshots.length !== beforeCaps) lines = gcLines(lines, snapshots);

        await writeHistory(fileHandle, lines, snapshots);
        return newRefs;
    } catch {
        // Never crash the app over a backup failure
        return null;
    }
}

/**
 * Removes every version of one file from history and reclaims the lines only it used.
 * Does nothing if there is no directory handle, no history file, or no matching entries.
 *
 * @async
 * @param {string} filename
 * @param {string} filepath
 * @returns {Promise<boolean>} true when the history file was rewritten.
 */
export async function deleteFileHistory(filename, filepath) {
    if (!appState.dirHandle) return false;

    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER);
        const fileHandle = await gypsumDir.getFileHandle(BACKUP_FILENAME);
        const { lines, snapshots } = parseHistory(await (await fileHandle.getFile()).text());

        const kept = snapshots.filter(s => !(s.filename === filename && s.filepath === filepath));
        if (kept.length === snapshots.length) return false;

        await writeHistory(fileHandle, gcLines(lines, kept), kept);
        return true;
    } catch {
        return false;
    }
}

/**
 * Empties history.gypsum entirely. Irreversible.
 *
 * @async
 * @returns {Promise<boolean>} true when the history file was rewritten.
 */
export async function clearAllHistory() {
    if (!appState.dirHandle) return false;

    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER);
        const fileHandle = await gypsumDir.getFileHandle(BACKUP_FILENAME);
        await writeHistory(fileHandle, [], []);
        return true;
    } catch {
        return false;
    }
}
