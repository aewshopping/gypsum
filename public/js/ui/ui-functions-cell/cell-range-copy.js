import { rangeGrid } from './cell-range.js';
import { joinFlowItems } from '../../services/file-parsing/flow-list.js';
import { reportCopied } from '../ui-functions-render/output-report.js';

/**
 * @file Copying a range of table cells to the clipboard, as TSV — what a spreadsheet reads.
 *
 * **Through the browser's own `copy` event**, which Ctrl+C fires even from a closed cell with nothing
 * selected, and which the copy button fires with document.execCommand('copy'). One handler builds the
 * text for both, sets it synchronously, and needs no permission — the async clipboard API asks for a
 * secure context, and the app also ships as one HTML file that may be opened from file://.
 *
 * **Each cell copies what it shows.** The renderer already writes a cell as its note's own text, or
 * as the app's formatted text for the values it owns (a date and time, a size), so a cell's
 * textContent is right for every column but two: tags, drawn as pills with nothing between them, and
 * the file column, whose link says "open". Tags copy as one comma-joined line, as a list cell shows
 * one; the file column copies a count, 1 on the first copied row. See plans/completed/table-range-select-copy.md §3.
 */

// Set while the copy button's menu is asking for a copy, which it may do with a cell open.
let requested = null;

/**
 * The copy event, from anywhere: copies the range when focus is on a closed table cell, or when the
 * copy button asked. Anything else — a text box, an open cell's own selected text, the rest of the
 * page — is left to the browser.
 * @param {ClipboardEvent} evt
 * @returns {void}
 */
export function handleRangeCopy(evt) {
    const focused = document.activeElement?.closest?.('.list-table .note-table-cell');
    if (!requested && (!focused || focused.classList.contains('is-expanded'))) return;

    // With no range, the focused cell alone: a range of one.
    const grid = rangeGrid() ?? (focused ? [[focused]] : null);
    if (!grid) return;

    const lines = grid.map((cells, row) => cells.map(cell => field(cellText(cell, row))).join('\t'));
    const headers = Boolean(requested?.headers);
    if (headers) lines.unshift(grid[0].map(cell => field(heading(cell))).join('\t'));

    evt.clipboardData.setData('text/plain', lines.join('\n'));
    evt.preventDefault();
    reportCopied(grid.length * grid[0].length, headers);
}

/**
 * Copies the range from the copy button's menu, through the same copy event Ctrl+C fires.
 * @param {boolean} headers - Put the columns' headings on a first line.
 * @returns {void}
 */
export function copyRange(headers) {
    requested = { headers };
    try {
        document.execCommand('copy');
    } finally {
        requested = null;
    }
}

/**
 * The text one cell copies.
 * @param {HTMLElement} cell
 * @param {number} row - The cell's row within the copy, from 0.
 * @returns {string}
 */
function cellText(cell, row) {
    if (cell.dataset.prop === 'internalId') return String(row + 1);
    if (cell.dataset.prop === 'tags') return joinFlowItems([...cell.querySelectorAll('[data-tag]')].map(pill => pill.dataset.tag));
    return cell.textContent;
}

/**
 * A column's heading as the header draws it.
 * @param {HTMLElement} cell - Any cell of the column.
 * @returns {string}
 */
function heading(cell) {
    const header = document.querySelector(`.note-table-cell-header[data-property="${CSS.escape(cell.dataset.prop)}"] .header-label`);
    return header?.textContent ?? cell.dataset.prop;
}

/**
 * One TSV field. A value holding a tab, a line break or a double quote is quoted, its quotes doubled,
 * as a spreadsheet writes it — anything else goes as it is.
 * @param {string} text
 * @returns {string}
 */
function field(text) {
    return /[\t\n\r"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
