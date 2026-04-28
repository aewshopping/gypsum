/**
 * Renders the inner HTML for the history select element.
 *
 * The <button> shows the filepath and (when a history entry is selected) a version
 * label — this is what the user sees when the select is closed.
 *
 * Each <option> shows only the version label and timestamp — the filepath is not
 * repeated in the dropdown list.
 *
 * The "current" option has no version label. Historical options are labelled
 * v-1 (most recent backup), v-2, v-3, … newest-first.
 *
 * @param {string} filepath - The full path of the open file (displayed in the button).
 * @param {Array<{timestamp: string}>} entries - Backup entries, newest-first.
 * @returns {string} HTML string for the select's innerHTML.
 */
export function renderHistorySelect(filepath, entries) {
    const historyOptions = entries.map((entry, i) =>
        `<option value="${i}">` +
          `<span class="opt-time">${formatTimestamp(entry.timestamp)}</span>` +
          `<span class="flexgrow"></span>` +
          `<span class="opt-version"> (v-${i + 1})</span>` +
        `</option>`
    ).join('');

    return `<button><span class="opt-filename" data-prop="filename">${filepath}&nbsp;</span><span class="opt-version"></span></button>`+
           `<option value="current" class="flex-row"><span class="opt-time">current version</span><span class="flexgrow"></span><button data-action="rename-file" id="rename-file-btn">file options</button></option>` +
           historyOptions;
}

/**
 * Formats an ISO 8601 timestamp as "yyyy-mm-dd hh:mm:ss" (UTC).
 * @param {string} isoString
 * @returns {string}
 */
function formatTimestamp(isoString) {
    return isoString.replace('T', ' ').slice(0, 19);
}
