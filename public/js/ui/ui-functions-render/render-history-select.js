/**
 * Renders the inner HTML for the history select element.
 * Each option has three spans controlling what appears in the collapsed picker
 * vs the open dropdown:
 *   .opt-filename — picker only (CSS hides it in the dropdown)
 *   .opt-version  — shown in both picker and dropdown
 *   .opt-time     — dropdown only (CSS hides it in the picker)
 *
 * The "current" option has no version label. Historical options are labelled
 * v-1 (most recent backup), v-2, v-3, … newest-first.
 *
 * @param {string} filename - The name of the open file.
 * @param {Array<{timestamp: string}>} entries - Backup entries, newest-first.
 * @returns {string} HTML string of <option> elements.
 */
export function renderHistorySelect(filename, entries) {
    const historyOptions = entries.map((entry, i) =>
        `<option value="${i}">
           <span class="opt-filename">${filename}</span>
           <span class="opt-version"> (v-${i + 1})</span>
           <span class="opt-time">${formatTimestamp(entry.timestamp)}</span>
         </option>`
    ).join('');

    return `<button><selectedcontent></selectedcontent></button>
            <option value="current">
              <span class="opt-filename">${filename}</span>
              <span class="opt-version"></span>
              <span class="opt-time">current</span>
            </option>${historyOptions}`;
}

/**
 * Formats an ISO 8601 timestamp as "yyyy-mm-dd hh:mm:ss" (UTC).
 * @param {string} isoString
 * @returns {string}
 */
function formatTimestamp(isoString) {
    return isoString.replace('T', ' ').slice(0, 19);
}
