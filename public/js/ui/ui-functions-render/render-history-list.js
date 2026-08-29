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
    // Bars are scaled against the biggest file, so the longest bar is always full width and
    // the rest read as a share of it — the comparison is between rows, not against a total.
    const largest = Math.max(1, ...files.map(file => file.reclaimBytes));

    const rows = files.map(file => {
        const data = `data-filepath="${file.filepath}" data-filename="${file.filename}" data-file-id="${file.filepath}"`;
        const action = file.missing
            ? `<button class="history-row-btn" data-action="history-recreate" ${data} data-tip="recreate this file from its newest version">` +
                `<svg class="history-row-icon"><use href="#icon-history-recreate"></use></svg></button>`
            : `<button class="history-row-btn" data-action="history-open-file" ${data} data-tip="open this file">` +
                `<svg class="history-row-icon"><use href="#icon-history-open"></use></svg></button>`;

        return `<div class="history-row${file.missing ? ' history-row-missing' : ''}">` +
                 `<span class="history-row-main">` +
                   `<span class="history-row-text">` +
                     `<span class="history-row-name">${file.filename}</span>` +
                     `<span class="history-row-meta text-muted">${file.versions} version${file.versions === 1 ? '' : 's'} · ${formatBytes(file.reclaimBytes)}</span>` +
                   `</span>` +
                   `<span class="history-row-bar" style="--size-pct: ${Math.round((file.reclaimBytes / largest) * 100)}"></span>` +
                 `</span>` +
                 // Sticky, so the actions stay put while the row text scrolls under them
                 `<span class="history-row-actions">` +
                   action +
                   `<button class="history-row-btn history-row-btn-delete" data-action="history-delete" ${data} data-tip="delete this file's history">` +
                     `<svg class="history-row-icon"><use href="#icon-history-delete"></use></svg></button>` +
                 `</span>` +
               `</div>`;
    }).join('');

    // One wrapper sized to the widest row, so the list scrolls sideways as a whole and every
    // row keeps the same width — rather than each row scrolling on its own.
    return rows
        ? `<div class="history-rows">${rows}</div>`
        : `<p class="history-empty text-muted">No history recorded yet.</p>`;
}
