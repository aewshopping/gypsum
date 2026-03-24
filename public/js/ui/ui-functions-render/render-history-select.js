/**
 * Renders the inner HTML for the history select element.
 * First option is always "current". Remaining options are backup entries,
 * newest-first, formatted as "yyyy-mm-dd hh:mm:ss" (UTC).
 * Always includes "current" as the first option, so the select is meaningful
 * even when there are no history entries yet.
 *
 * @param {Array<{timestamp: string}>} entries - Backup entries, newest-first.
 * @returns {string} HTML string of <option> elements.
 */
export function renderHistorySelect(entries) {
    const historyOptions = entries.map((entry, i) =>
        `<option value="${i}">${formatTimestamp(entry.timestamp)}</option>`
    ).join('');

    return `<option value="current">current</option>${historyOptions}`;
}

/**
 * Formats an ISO 8601 timestamp as "yyyy-mm-dd hh:mm:ss" (UTC).
 * @param {string} isoString
 * @returns {string}
 */
function formatTimestamp(isoString) {
    return isoString.replace('T', ' ').slice(0, 19);
}
