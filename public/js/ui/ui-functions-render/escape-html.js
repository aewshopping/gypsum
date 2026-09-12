/**
 * @file The app's one answer to "this text came from a file — how do I put it in markup?".
 *
 * Three copies of this grew up independently, which is how one of them ends up subtly wrong:
 * the table's cells had no copy at all, and a front matter value holding `a <b> c` was rendered
 * as `a  c` because the browser read the `<b>` as a tag. That was a display fault until a cell
 * became the thing an edit is read back out of, at which point it silently rewrote the note.
 *
 * See plans/completed/table-cell-editors.md §1.1.
 */

/**
 * Escapes HTML-significant characters so a string can be injected into markup, including as a
 * quoted attribute value. The quote is escaped as well as the angle brackets, so one function
 * serves both positions and no caller has to work out which one it is in.
 *
 * @param {string} value - The raw string to escape.
 * @returns {string} The escaped string.
 */
export function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
