import { appState } from '../services/store.js';

const BACKUP_FILENAME = 'history.gypsum';
const MAX_SNAPSHOTS = 500;

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
            const entryLines = entry.content.split('\n');
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
 * Appends a snapshot entry to history.gypsum in the loaded directory using
 * the line pool format — each unique line is stored once; snapshots reference
 * lines by index. Evicts the oldest snapshot when MAX_SNAPSHOTS is reached,
 * then garbage-collects unreferenced lines.
 * Does nothing silently if no directory handle is available (file picker path).
 *
 * @async
 * @param {{ filepath: string, filename: string, content: string }} snapshot
 * @param {'open' | 'close'} event
 * @returns {Promise<number[]|null>} The lineRefs assigned to the snapshot, or null on failure.
 */
export async function saveBackupEntry(snapshot, event) {
    if (!appState.dirHandle) return;

    try {
        const fileHandle = await appState.dirHandle.getFileHandle(BACKUP_FILENAME, { create: true });
        const existingText = await (await fileHandle.getFile()).text();

        let { lines, snapshots } = parseHistory(existingText);

        // Build index of existing lines for O(1) dedup lookup
        const lineIndex = new Map();
        lines.forEach((line, i) => lineIndex.set(line, i));

        // Convert incoming content to lineRefs, extending the pool with new lines
        const incomingLines = snapshot.content.split('\n');
        const newRefs = incomingLines.map(line => {
            if (!lineIndex.has(line)) { lineIndex.set(line, lines.length); lines.push(line); }
            return lineIndex.get(line);
        });

        // Duplicate check: if last snapshot for this file has identical lineRefs, only refresh timestamp
        const lastForFile = [...snapshots].reverse().find(
            s => s.filename === snapshot.filename && s.filepath === snapshot.filepath
        );
        const isDuplicate = lastForFile &&
            lastForFile.lineRefs.length === newRefs.length &&
            lastForFile.lineRefs.every((v, i) => v === newRefs[i]);

        if (isDuplicate) {
            lastForFile.timestamp = new Date().toISOString();
        } else {
            snapshots.push({
                filepath: snapshot.filepath,
                filename: snapshot.filename,
                timestamp: new Date().toISOString(),
                event,
                lineRefs: newRefs,
            });
        }

        // Enforce cap: evict oldest snapshot(s) then GC orphaned lines
        if (snapshots.length > MAX_SNAPSHOTS) {
            snapshots = snapshots.slice(snapshots.length - MAX_SNAPSHOTS);

            const usedSet = new Set(snapshots.flatMap(s => s.lineRefs));
            const oldToNew = new Map();
            const newLines = [];
            for (let i = 0; i < lines.length; i++) {
                if (usedSet.has(i)) { oldToNew.set(i, newLines.length); newLines.push(lines[i]); }
            }
            for (const s of snapshots) s.lineRefs = s.lineRefs.map(i => oldToNew.get(i));
            lines = newLines;
        }

        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify({ lines, snapshots }, null, 2));
        await writable.close();
        return newRefs;
    } catch {
        // Never crash the app over a backup failure
        return null;
    }
}
