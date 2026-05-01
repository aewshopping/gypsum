/**
 * @file Keyboard navigation for keyboard-navigable file cards.
 * Arrow keys move focus spatially; Enter/Space opens the focused card.
 * PageDown/PageUp jump by one screenful of rows (with one row of overlap).
 * Column count and rows-on-screen are derived from element Y-positions and
 * cached via ResizeObserver on #output.
 */

let _cachedCols = 0;
let _cachedRowsOnScreen = 0;

/**
 * Computes the number of columns by finding the first element whose top edge
 * exceeds that of the first element (i.e. is on row 2).
 * @param {Element[]} els
 * @returns {number}
 */
function computeColumnCount(els) {
    if (els.length === 0) return 1;
    const firstTop = els[0].getBoundingClientRect().top;
    const cols = els.findIndex(el => el.getBoundingClientRect().top > firstTop);
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
 * Handles arrow-key, Enter/Space, and PageDown/PageUp navigation for
 * keyboard-navigable file cards.
 * @param {KeyboardEvent} evt
 */
export function handleKeyboardNavigate(evt) {
    const focused = document.activeElement;
    if (!focused?.classList.contains('keyboard-navigable')) return;

    const key = evt.key;
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'PageDown', 'PageUp'].includes(key)) return;

    evt.preventDefault();

    if (key === 'Enter' || key === ' ') { focused.click(); return; }

    const els = [...document.querySelectorAll('.keyboard-navigable')];
    const idx = parseInt(focused.dataset.index, 10) - 1; // data-index is 1-based

    if (key === 'ArrowRight') { els[idx + 1]?.focus(); return; }
    if (key === 'ArrowLeft')  { els[idx - 1]?.focus(); return; }

    const cols = _cachedCols || computeColumnCount(els);

    if (key === 'ArrowDown') { els[idx + cols]?.focus(); return; }
    if (key === 'ArrowUp')   { els[idx - cols]?.focus(); return; }

    // PageDown/PageUp: jump by (rowsOnScreen - 1) rows, preserving column.
    // The -1 gives one row of overlap with the previous view (standard paging behaviour).
    const rowsOnScreen = _cachedRowsOnScreen || computeRowsOnScreen(els, cols);
    const pageDelta = cols * (rowsOnScreen - 1);

    if (key === 'PageDown') {
        let target = idx + pageDelta;
        while (target > idx && !els[target]) target -= cols;
        if (target > idx) els[target].focus();
        return;
    }
    if (key === 'PageUp') {
        let target = idx - pageDelta;
        while (target < idx && !els[target]) target += cols;
        if (target < idx) els[target].focus();
    }
}
