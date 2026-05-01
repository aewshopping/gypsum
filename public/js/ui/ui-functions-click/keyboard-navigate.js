/**
 * @file Keyboard navigation for keyboard-navigable file cards.
 * Arrow keys move focus spatially; Enter opens the focused card.
 * Column count is derived from element Y-positions and cached via ResizeObserver.
 */

let _cachedCols = 0;

/**
 * Computes the number of columns in the current layout by finding the first
 * element whose top edge exceeds that of the first element (i.e. is on row 2).
 * @param {Element[]} els - All currently rendered keyboard-navigable elements.
 * @returns {number}
 */
function computeColumnCount(els) {
    if (els.length === 0) return 1;
    const firstTop = els[0].getBoundingClientRect().top;
    const cols = els.findIndex(el => el.getBoundingClientRect().top > firstTop);
    return cols === -1 ? els.length : cols;
}

new ResizeObserver(() => {
    const els = [...document.querySelectorAll('.keyboard-navigable')];
    _cachedCols = computeColumnCount(els);
}).observe(document.getElementById('output'));

/**
 * Handles arrow-key and Enter navigation for keyboard-navigable file cards.
 * Right/Left move by one; Up/Down move by the detected column count.
 * @param {KeyboardEvent} evt
 */
export function handleKeyboardNavigate(evt) {
    const focused = document.activeElement;
    if (!focused?.classList.contains('keyboard-navigable')) return;

    const key = evt.key;
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter'].includes(key)) return;

    evt.preventDefault();

    if (key === 'Enter') { focused.click(); return; }

    const els = [...document.querySelectorAll('.keyboard-navigable')];
    const idx = parseInt(focused.dataset.index, 10) - 1; // data-index is 1-based

    if (key === 'ArrowRight') { els[idx + 1]?.focus(); return; }
    if (key === 'ArrowLeft')  { els[idx - 1]?.focus(); return; }

    const cols = _cachedCols || computeColumnCount(els);

    if (key === 'ArrowDown') { els[idx + cols]?.focus(); return; }
    if (key === 'ArrowUp')   { els[idx - cols]?.focus(); }
}
