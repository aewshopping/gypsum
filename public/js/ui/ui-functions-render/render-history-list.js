/**
 * Formats a byte count for display: '512 B', '4.2 KB', '1.8 MB'.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Formats an ISO 8601 timestamp as "yyyy-mm-dd" (UTC).
 * Date only: the overview is scanned down a column, and the time of day says nothing
 * useful about which file is worth attention.
 * @param {string} isoString
 * @returns {string}
 */
function formatTimestamp(isoString) {
    return isoString.slice(0, 10);
}

/**
 * Renders the one-line totals shown above the list.
 * @param {{totalBytes: number, files: Array<{versions: number}>}} summary
 * @returns {string}
 */
export function renderHistoryTotals({ totalBytes, files }) {
    if (!files.length) return ''; // the list's empty state says it; twice is once too many
    const versions = files.reduce((sum, file) => sum + file.versions, 0);
    return `${formatBytes(totalBytes)} · ${versions} version${versions === 1 ? '' : 's'} · ${files.length} file${files.length === 1 ? '' : 's'}`;
}

/**
 * Renders the history list: one row per file, most recently snapshotted first.
 *
 * A missing file (deleted, or moved outside the app) gets a recreate button in place of
 * open — recreating it at its original path is what makes its versions reachable again,
 * because history entries are keyed on filename and filepath.
 *
 * @param {Array<{filepath: string, filename: string, versions: number, newest: string, reclaimBytes: number, missing: boolean}>} files
 * @returns {string} HTML string for the list container's innerHTML.
 */
export function renderHistoryList(files) {
    const rows = files.map(file => {
        const data = `data-filepath="${file.filepath}" data-filename="${file.filename}" data-file-id="${file.filepath}"`;
        const action = file.missing
            ? `<button class="history-row-btn" data-action="history-recreate" ${data} data-tip="recreate this file from its newest version">recreate</button>`
            : `<button class="history-row-btn" data-action="history-open-file" ${data} data-tip="open this file">open</button>`;

        // The text scrolls inside its own box rather than the row scrolling as a whole: a long
        // filename must not push the buttons out of reach, which on a phone is every row.
        return `<div class="history-row${file.missing ? ' history-row-missing' : ''}">` +
                 `<span class="history-row-text">` +
                   `<span class="history-row-name">${file.filename}</span>` +
                   `<span class="history-row-meta">${file.versions} version${file.versions === 1 ? '' : 's'} · ${formatTimestamp(file.newest)} · ${formatBytes(file.reclaimBytes)}</span>` +
                 `</span>` +
                 action +
                 `<button class="history-row-btn history-row-btn-delete" data-action="history-delete" ${data} data-tip="delete this file's history">delete</button>` +
               `</div>`;
    }).join('');

    return rows || `<p class="history-empty">No history recorded yet.</p>`;
}
