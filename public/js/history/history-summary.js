import { appState } from '../services/store.js';
import { BACKUP_FILENAME, SAVE_FOLDER } from '../constants.js';

/**
 * Normalises history.gypsum text into { lines, snapshots }, handling the legacy flat-array
 * format where each entry carried a plain `content` string instead of lineRefs.
 * @param {string} text
 * @returns {{ lines: string[], snapshots: Array<object> }}
 */
function normalise(text) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return { lines: parsed.lines ?? [], snapshots: parsed.snapshots ?? [] };

    const lines = [];
    const snapshots = parsed.map(entry => ({
        ...entry,
        lineRefs: entry.content.split(/\r?\n/).map(line => lines.push(line) - 1),
    }));
    return { lines, snapshots };
}

/**
 * Counts how many distinct files reference each line in the pool. A line used by only one
 * file is reclaimable when that file's history is deleted; a shared one is not.
 * @param {Array<{lineRefs:number[]}>} snapshots
 * @param {Function} keyOf
 * @returns {Map<number, number>} line index → number of distinct files using it
 */
function countFilesPerLine(snapshots, keyOf) {
    const filesPerLine = new Map();
    for (const snapshot of snapshots) {
        const key = keyOf(snapshot);
        for (const ref of new Set(snapshot.lineRefs)) {
            let owners = filesPerLine.get(ref);
            if (owners === undefined) { owners = new Set(); filesPerLine.set(ref, owners); }
            owners.add(key);
        }
    }
    return new Map([...filesPerLine].map(([ref, owners]) => [ref, owners.size]));
}

/**
 * Reads history.gypsum and summarises it one row per file, most recently snapshotted first.
 *
 * `reclaimBytes` is what deleting that file's history would actually free: its own snapshot
 * records, plus the pool lines no other file references. Lines shared with another file are
 * excluded because deleting this file would not release them.
 *
 * `missing` marks a file that is no longer in the loaded folder — deleted, or moved outside
 * the app. Renames do not land here: rename-backups.js retags entries to the new path.
 *
 * Returns { totalBytes: 0, files: [] } when there is no directory handle, no backup file,
 * or the file is unreadable — the same tolerance as readBackupHistory.
 *
 * @async
 * @returns {Promise<{totalBytes: number, files: Array<{filepath: string, filename: string, versions: number, oldest: string, newest: string, reclaimBytes: number, missing: boolean}>}>}
 */
export async function readHistorySummary() {
    const empty = { totalBytes: 0, files: [] };
    if (!appState.dirHandle) return empty;

    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER);
        const fileHandle = await gypsumDir.getFileHandle(BACKUP_FILENAME);
        const text = await (await fileHandle.getFile()).text();
        if (!text.trim()) return empty;

        const { lines, snapshots } = normalise(text);
        const keyOf = s => `${s.filepath}\n${s.filename}`;
        const filesPerLine = countFilesPerLine(snapshots, keyOf);
        const livePaths = new Set(appState.myFiles.map(f => f.filepath));

        const byFile = new Map();
        for (const snapshot of snapshots) {
            const key = keyOf(snapshot);
            let row = byFile.get(key);
            if (row === undefined) {
                row = {
                    filepath: snapshot.filepath,
                    filename: snapshot.filename,
                    versions: 0,
                    oldest: snapshot.timestamp,
                    newest: snapshot.timestamp,
                    reclaimBytes: 0,
                    missing: !livePaths.has(snapshot.filepath),
                    exclusiveLines: new Set(),
                };
                byFile.set(key, row);
            }
            row.versions++;
            if (snapshot.timestamp < row.oldest) row.oldest = snapshot.timestamp;
            if (snapshot.timestamp > row.newest) row.newest = snapshot.timestamp;
            row.reclaimBytes += JSON.stringify(snapshot).length;
            for (const ref of snapshot.lineRefs) {
                if (filesPerLine.get(ref) === 1) row.exclusiveLines.add(ref);
            }
        }

        const files = [...byFile.values()].map(({ exclusiveLines, ...row }) => {
            for (const ref of exclusiveLines) row.reclaimBytes += lines[ref].length + 3; // quotes + comma
            return row;
        });
        files.sort((a, b) => b.newest.localeCompare(a.newest));

        return { totalBytes: text.length, files };
    } catch {
        return empty;
    }
}
