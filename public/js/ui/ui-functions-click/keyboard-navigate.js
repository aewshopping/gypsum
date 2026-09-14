import { selectCell } from '../ui-functions-cell/cell-expand.js';

/**
 * @file Keyboard navigation for keyboard-navigable file cards.
 * Arrow keys move focus spatially; Enter/Space opens the focused card.
 * PageDown/PageUp jump by one screenful of rows (with one row of overlap).
 * Column count and rows-on-screen are derived from element Y-positions and
 * cached via ResizeObserver on #output.
 *
 * In the table, a cell arrived at is also the cell selected — see go() below.
 */

let _cachedCols = 0;
let _cachedRowsOnScreen = 0;

/**
 * Moves to an element: focuses it, and makes it the selected cell when it is one.
 *
 * Every move goes through here rather than calling focus() directly, so that a table cell arrived at
 * by keyboard is in the same state as one arrived at by clicking — which is what lets Enter open it,
 * and what stops the previous cell keeping a mark it no longer means.
 *
 * @param {Element} [element] - Absent where the grid has no cell in that direction.
 * @returns {void}
 */
function go(element) {
    if (!element) return;

    element.focus();
    selectCell(element);
}

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
 * for keyboard-navigable file cards. Ctrl+Arrow jumps to the start/end of the
 * current row (Ctrl+Left/Right) or column (Ctrl+Up/Down).
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
    const idx = parseInt(focused.dataset.index, 10) - 1; // data-index is 1-based
    const cols = _cachedCols || computeColumnCount(els);

    if (evt.ctrlKey) {
        if (key === 'ArrowRight') {
            go(els[Math.min(Math.floor(idx / cols) * cols + cols - 1, els.length - 1)]);
            return;
        }
        if (key === 'ArrowLeft') {
            go(els[Math.floor(idx / cols) * cols]);
            return;
        }
        if (key === 'ArrowDown') {
            let n = idx;
            while (els[n + cols]) n += cols;
            go(els[n]);
            return;
        }
        if (key === 'ArrowUp') {
            go(els[idx % cols]);
            return;
        }
    }

    if (key === 'ArrowRight') { go(els[idx + 1]); return; }
    if (key === 'ArrowLeft')  { go(els[idx - 1]); return; }

    if (key === 'ArrowDown') { go(els[idx + cols]); return; }
    if (key === 'ArrowUp')   { go(els[idx - cols]); return; }

    // PageDown/PageUp: jump by (rowsOnScreen - 1) rows, preserving column.
    // The -1 gives one row of overlap with the previous view (standard paging behaviour).
    const rowsOnScreen = _cachedRowsOnScreen || computeRowsOnScreen(els, cols);
    const pageDelta = cols * (rowsOnScreen - 1);

    if (key === 'PageDown') {
        let target = idx + pageDelta;
        while (target > idx && !els[target]) target -= cols;
        if (target > idx) go(els[target]);
        return;
    }
    if (key === 'PageUp') {
        let target = idx - pageDelta;
        while (target < idx && !els[target]) target += cols;
        if (target < idx) go(els[target]);
    }
}
