import { appState } from '../../services/store.js';
import { rangeGrid } from './cell-range.js';
import { joinFlowItems } from '../../services/file-parsing/flow-list.js';
import { reportCopied } from '../ui-functions-render/output-report.js';
import { tsvField as field } from '../../services/tsv.js';

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
 *
 * **What was copied stays outlined while it is on the clipboard** — through sorts, filters and new
 * selections, since it is held as notes and columns, and not cleared by Escape, which cannot safely
 * empty the clipboard. It goes with "clear copied cells", which empties it, with another copy here or
 * anywhere in the page, with a held row move appearing (pending-row-move.js), and with a folder load.
 * The mechanism is the held row move's: a class the renderer draws from appState, put straight on for
 * the render already done, and one dashed box per row.
 */

// Set while the copy button's menu is asking for a copy, which it may do with a cell open — or for the
// clipboard to be emptied, which is a copy of nothing.
let requested = null;

/**
 * The copy event, from anywhere: copies the range when focus is on a closed table cell, or when the
 * copy button asked. Anything else — a text box, an open cell's own selected text, the rest of the
 * page — is left to the browser.
 * @param {ClipboardEvent} evt
 * @returns {void}
 */
export function handleRangeCopy(evt) {
    if (requested?.clear) {
        evt.clipboardData.setData('text/plain', '');
        evt.preventDefault();
        clearCopiedCells();
        return;
    }

    const focused = document.activeElement?.closest?.('.list-table .note-table-cell');
    if (!requested && (!focused || focused.classList.contains('is-expanded'))) {
        // Someone else's copy: what is on the clipboard is no longer these cells.
        clearCopiedCells();
        return;
    }

    // With no range, the focused cell alone: a range of one.
    const grid = rangeGrid() ?? (focused ? [[focused]] : null);
    if (!grid) return;

    const lines = grid.map((cells, row) => cells.map(cell => field(cellText(cell, row))).join('\t'));
    const headers = Boolean(requested?.headers);
    if (headers) lines.unshift(grid[0].map(cell => field(heading(cell))).join('\t'));

    evt.clipboardData.setData('text/plain', lines.join('\n'));
    evt.preventDefault();
    reportCopied(grid.length * grid[0].length, headers);

    appState.copiedCells = {
        ids: new Set(grid.map(cells => cells[0].closest('.note-table').dataset.vtId)),
        props: new Set(grid[0].map(cell => cell.dataset.prop)),
    };
    markCopied();
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
 * Empties the clipboard and takes the outline off, through the same copy event — synchronous inside
 * the click that asked, so it needs no permission and works from file://.
 * @returns {void}
 */
export function clearCopied() {
    requested = { clear: true };
    try {
        document.execCommand('copy');
    } finally {
        requested = null;
    }
}

/**
 * Takes the outline off what was copied, leaving the clipboard as it is.
 * @returns {void}
 */
export function clearCopiedCells() {
    if (!appState.copiedCells) return;
    appState.copiedCells = null;
    markCopied();
}

/**
 * Puts the copy outline on the drawn rows appState.copiedCells names, and takes it off every other —
 * for the render already done; the next one draws it from state. The copy button says there is
 * something to clear even when those rows are on another page.
 * @returns {void}
 */
function markCopied() {
    const copied = appState.copiedCells;
    document.getElementById('range-copy-btn')?.toggleAttribute('data-copied', Boolean(copied));

    for (const row of document.querySelectorAll('.list-table > .note-table')) {
        const style = copied?.ids.has(row.dataset.vtId)
            ? copiedColumnsStyle([...row.children].map(cell => cell.dataset.prop))
            : '';
        row.classList.toggle('has-copied', Boolean(style));
        row.style.removeProperty('--copied-from');
        row.style.removeProperty('--copied-to');
        if (style) row.style.cssText += style;
    }
}

/**
 * Where the copy outline sits in a row: the grid lines either side of the first and last copied
 * column. A row is a subgrid of the table's columns, so one box placed on those lines covers the
 * copied cells, drawn as the held row move's is — see note-table-copied.css.
 * @param {string[]} columns - The row's columns, in the order drawn.
 * @returns {string} `--copied-from: 5; --copied-to: 7`, or '' when nothing in these columns is copied.
 */
export function copiedColumnsStyle(columns) {
    const props = appState.copiedCells?.props;
    const at = columns.flatMap((name, index) => props?.has(name) ? [index] : []);
    return at.length ? `--copied-from: ${at[0] + 1}; --copied-to: ${at.at(-1) + 2}` : '';
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
