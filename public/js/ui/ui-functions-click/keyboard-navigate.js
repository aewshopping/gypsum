/**
 * @file Keyboard navigation for keyboard-navigable file cards.
 * Arrow keys move focus spatially; Enter/Space opens the focused card.
 * PageDown/PageUp jump by one screenful of rows (with one row of overlap).
 * Column count and rows-on-screen are derived from element Y-positions and
 * cached via ResizeObserver on #output.
 *
 * In the table, a cell arrived at is also the cell selected, because selection follows focus —
 * cell-expand.js does that, and moving focus is this file's whole job. Shift moves a range's far
 * corner instead, with the same arithmetic.
 */

import { extendRange, rangeExtent, clearRange } from '../ui-functions-cell/cell-range.js';
import { revealCell } from '../ui-functions-table/table-focus-scroll.js';

let _cachedCols = 0;
let _cachedRowsOnScreen = 0;

/**
 * Computes the number of columns by finding the first element (after index 0)
 * whose left edge matches that of the first element (i.e. is on row 2, column 0).
 * Works for both standard CSS grid (row-first) and grid-lanes (column-first).
 * @param {Element[]} els
 * @returns {number}
 */
function computeColumnCount(els) {
    if (els.length === 0) return 1;
    const firstLeft = els[0].getBoundingClientRect().left;
    const cols = els.findIndex((el, i) => i > 0 && el.getBoundingClientRect().left === firstLeft);
    return cols === -1 ? els.length : cols;
}

/**
 * Computes how many card rows fit in the usable viewport (below .stick-top).
 * Row height is the Y-distance between the first and second rows.
 * @param {Element[]} els
 * @param {number} cols
 * @returns {number}
 */
function computeRowsOnScreen(els, cols) {
    if (els.length <= cols) return 1;
    const rowHeight = els[cols].getBoundingClientRect().top - els[0].getBoundingClientRect().top;
    if (rowHeight <= 0) return 1;
    const stickyEl = document.querySelector('.stick-top');
    const stickyHeight = stickyEl ? stickyEl.getBoundingClientRect().height : 0;
    return Math.ceil((window.innerHeight - stickyHeight) / rowHeight);
}

new ResizeObserver(() => {
    const els = [...document.querySelectorAll('.keyboard-navigable')];
    _cachedCols = computeColumnCount(els);
    _cachedRowsOnScreen = computeRowsOnScreen(els, _cachedCols);
}).observe(document.getElementById('output'));

/**
 * Handles arrow-key, Ctrl+arrow, Enter/Space, and PageDown/PageUp navigation
 * for keyboard-navigable file cards, and Shift with any of the moves to extend a table range.
 * @param {KeyboardEvent} evt
 */
export function handleKeyboardNavigate(evt) {
    const focused = document.activeElement;
    if (!focused?.classList.contains('keyboard-navigable')) return;
    if (focused.isContentEditable) return; // an expanded cell: the keys belong to the caret

    const key = evt.key;

    // F2 opens a table cell for editing, which is where a spreadsheet puts it. Only a cell: on a
    // card the same click opens the note, and F2 does not mean that anywhere. Enter and Space open
    // both, being "activate what is focused" rather than "edit it".
    if (key === 'F2' && focused.classList.contains('note-table-cell')) {
        evt.preventDefault();
        focused.click();
        return;
    }

    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'PageDown', 'PageUp'].includes(key)) return;

    evt.preventDefault();

    if (key === 'Enter' || key === ' ') { focused.click(); return; }

    const els = [...document.querySelectorAll('.keyboard-navigable')];
    const cols = _cachedCols || computeColumnCount(els);

    // Shift in the table moves a range's far corner rather than focus, and carries on from wherever
    // that corner already is — so a range can be grown across several presses of Shift, and after a
    // drag. Focus stays on the cell the range grows from. See ui-functions-cell/cell-range.js.
    if (evt.shiftKey && focused.classList.contains('note-table-cell')) {
        const from = rangeExtent() ?? focused;
        const idx = indexOf(from);
        const target = els[targetIndex(key, evt.ctrlKey, idx, els, cols)];
        if (!target) return;
        // A range does not wrap: past the end of a row there is nothing further right.
        if ((key === 'ArrowRight' || key === 'ArrowLeft') && rowOf(target, cols) !== rowOf(from, cols)) return;

        extendRange(focused, target);
        revealCell(target);
        target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
    }

    clearRange();
    els[targetIndex(key, evt.ctrlKey, indexOf(focused), els, cols)]?.focus();
}

/**
 * An element's position among the keyboard-navigable ones; data-index is 1-based.
 * @param {HTMLElement} el
 * @returns {number}
 */
function indexOf(el) {
    return parseInt(el.dataset.index, 10) - 1;
}

/**
 * @param {HTMLElement} el
 * @param {number} cols
 * @returns {number}
 */
function rowOf(el, cols) {
    return Math.floor(indexOf(el) / cols);
}

/**
 * Where a key moves to from an index. One answer for focus and for a range's far corner, so the
 * edge rules exist once. Ctrl+Arrow jumps to the start/end of the current row (Ctrl+Left/Right) or
 * column (Ctrl+Up/Down); PageDown/PageUp jump by one screenful of rows, less one row of overlap.
 * @param {string} key
 * @param {boolean} ctrl
 * @param {number} idx
 * @param {Element[]} els
 * @param {number} cols
 * @returns {number} An index, which may be off either end of els — nowhere to go.
 */
function targetIndex(key, ctrl, idx, els, cols) {
    if (ctrl) {
        if (key === 'ArrowRight') return Math.min(Math.floor(idx / cols) * cols + cols - 1, els.length - 1);
        if (key === 'ArrowLeft') return Math.floor(idx / cols) * cols;
        if (key === 'ArrowDown') {
            let n = idx;
            while (els[n + cols]) n += cols;
            return n;
        }
        if (key === 'ArrowUp') return idx % cols;
    }

    if (key === 'ArrowRight') return idx + 1;
    if (key === 'ArrowLeft') return idx - 1;
    if (key === 'ArrowDown') return idx + cols;
    if (key === 'ArrowUp') return idx - cols;

    // PageDown/PageUp: jump by (rowsOnScreen - 1) rows, preserving column.
    // The -1 gives one row of overlap with the previous view (standard paging behaviour).
    const rowsOnScreen = _cachedRowsOnScreen || computeRowsOnScreen(els, cols);
    const pageDelta = cols * (rowsOnScreen - 1);

    if (key === 'PageDown') {
        let target = idx + pageDelta;
        while (target > idx && !els[target]) target -= cols;
        return target;
    }
    let target = idx - pageDelta;
    while (target < idx && !els[target]) target += cols;
    return target;
}
