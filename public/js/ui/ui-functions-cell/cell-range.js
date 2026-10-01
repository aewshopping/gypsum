import { appState } from '../../services/store.js';
import { addressOf, elementAt } from '../ui-functions-render/keep-cell-state.js';

/**
 * @file A rectangular range of table cells: making it, ending it, and marking it.
 *
 * **The range grows from its anchor, and nothing here moves focus.** A drag, a shift-click and
 * Shift+arrow anchor it at the focused cell; select-all anchors it at the top-left corner and leaves
 * focus wherever it was, inside the range. So "selection follows focus" is untouched: the focused
 * cell keeps its selected outline inside the range, and a plain arrow moves from it as it always
 * did. The far corner, the extent, is what a drag and Shift+arrow move. A range ends whenever focus moves on, Escape is pressed
 * with no cell open, or a redraw changes which rows are drawn — every one of those through
 * clearRange(). **Opening the anchor does not end it**, and nor does the redraw that writes it: the
 * open cell is where a value for the whole range will be typed.
 *
 * **The marks are paint-only**: an inset box-shadow on each outside edge and a tinted background
 * image (note-table-range.css), so no layout runs however many rows the page holds. One element
 * drawn around the range was tried first and measured — moving anything inside .list-table has the
 * whole table grid laid out again, 55ms a move at 1,000 rows. See plans/completed/table-range-select-copy.md §2.3.
 */

const MARKS = ['in-range', 'range-top', 'range-bottom', 'range-left', 'range-right'];

/**
 * A cell's row and column, from where it sits in the DOM rather than from where it is drawn, so
 * nothing asks for a layout in the middle of a drag. The rows are the only children of .list-table,
 * and the cells the only children of a row.
 * @param {HTMLElement} cell
 * @returns {{row: number, col: number}}
 */
function gridPosition(cell) {
    const row = cell.parentElement;
    return { row: [...row.parentElement.children].indexOf(row), col: [...row.children].indexOf(cell) };
}

/**
 * Marks the cells of appState.tableRange, and unmarks every other. Exported for the redraw that
 * keeps the range, whose new rows carry no marks.
 *
 * Clears the whole of the last range and marks the whole of this one. Changing only the cells that
 * differ would be quicker on a range of tens of thousands of cells — and is the fix if that is ever
 * felt — but it measured at 2–5ms for ordinary ranges, against a 16ms frame.
 * @returns {void}
 */
export function paintRange() {
    for (const cell of document.querySelectorAll('.list-table .in-range')) cell.classList.remove(...MARKS);

    const grid = rangeGrid();
    if (!grid) return;

    const last = grid.length - 1;
    grid.forEach((cells, r) => cells.forEach((cell, c) => {
        const marks = cell.classList;
        marks.add('in-range');
        if (r === 0) marks.add('range-top');
        if (r === last) marks.add('range-bottom');
        if (c === 0) marks.add('range-left');
        if (c === cells.length - 1) marks.add('range-right');
    }));
}

/**
 * The range's cells, row by row as drawn — the one answer to "which cells are in it", shared by the
 * marks and the copy so the two cannot disagree.
 * @returns {HTMLElement[][]|null} Null when there is no range, or its corners are not on screen.
 */
export function rangeGrid() {
    const range = appState.tableRange;
    const anchor = elementAt(range?.anchor);
    const extent = elementAt(range?.extent);
    if (!anchor || !extent) return null;

    const a = gridPosition(anchor);
    const b = gridPosition(extent);
    const top = Math.min(a.row, b.row), bottom = Math.max(a.row, b.row);
    const left = Math.min(a.col, b.col), right = Math.max(a.col, b.col);
    const rows = anchor.parentElement.parentElement.children;

    const grid = [];
    for (let r = top; r <= bottom; r++) grid.push([...rows[r].children].slice(left, right + 1));
    return grid;
}

/**
 * Makes the range run from one cell to another, and marks it. A range of one cell is no range, so
 * that "is there a range" is always the one test.
 * @param {HTMLElement} anchor - The focused cell.
 * @param {HTMLElement} extent - The corner that moves.
 * @returns {void}
 */
export function extendRange(anchor, extent) {
    appState.tableRange = anchor === extent ? null : { anchor: addressOf(anchor), extent: addressOf(extent) };
    paintRange();
}

/**
 * The cell the range grows from: the focused cell, except after select-all.
 * @returns {HTMLElement|null} Null when there is no range.
 */
export function rangeAnchor() {
    return elementAt(appState.tableRange?.anchor);
}

/**
 * The range's moving corner, which is where Shift+arrow carries on from.
 * @returns {HTMLElement|null} Null when there is no range.
 */
export function rangeExtent() {
    return elementAt(appState.tableRange?.extent);
}

/**
 * Selects every cell the table has drawn: this page's rows, and no headings.
 *
 * Anchored at the top-left corner rather than at the focused cell, which stays where it is — somewhere
 * inside the range, like the active cell of a spreadsheet's select-all. Shift+arrow then moves the
 * bottom-right corner.
 * @returns {void}
 */
export function selectAllCells() {
    const scroller = document.querySelector('.list-table');
    const first = scroller.firstElementChild?.firstElementChild;
    if (first) extendRange(first, scroller.lastElementChild.lastElementChild);
}

/**
 * Moves focus without ending the range. A focus move ends a range, so it is held across the move and
 * marked again after — for a redraw putting focus back, and a paste putting it back after a dialog or
 * an inert table took it away. A range whose corners are no longer drawn is not put back.
 * @param {() => void} focusMove
 * @param {object|null} [range] - The range to keep; the current one unless given.
 * @returns {void}
 */
export function keepRangeAcross(focusMove, range = appState.tableRange) {
    focusMove();
    appState.tableRange = range && elementAt(range.anchor) && elementAt(range.extent) ? range : null;
    paintRange();
}

/**
 * Ends the range, if there is one.
 * @returns {void}
 */
export function clearRange() {
    if (!appState.tableRange) return;
    appState.tableRange = null;
    paintRange();
}
