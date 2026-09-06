/**
 * @file Drag-to-resize for a table column, reached only from "resize column" in the column
 * options menu. There is no handle on the header itself: the bar appears because the user
 * asked for it, and a press-and-release on it is the only thing that takes it away again.
 *
 * The bar is one reused element declared in index.html, parked over the target header cell's
 * right edge with getBoundingClientRect — the same trick #column-menu-anchor uses, and for
 * the same two reasons. The header carries a scroll-driven transform, which only
 * getBoundingClientRect reports; and .note-table-cell-header has overflow: hidden, so a child
 * bar overlaying the cell's own right border would be clipped by it.
 *
 * Its cost is that a fixed element does not follow the cell on its own, so the bar re-parks
 * itself whenever the cell might have moved. Scrolling is caught on the document in the capture
 * phase, because scroll events do not bubble — one listener then covers the page, the table's
 * own horizontal scroller and anything in between. Everything else is caught by watching the
 * size of #output: opening the recent files panel, for one, sets body's padding-inline-start,
 * which moves and narrows the table without firing a scroll or a window resize at all.
 *
 * Pointer events, not mouse events: mousedown is synthesised on touch, but no mousemove is
 * fired during a finger drag, so a mouse-event drag loop gets a press and a release with
 * nothing in between. Pointer events cover mouse and touch in one path.
 */

import { MIN_COLUMN_WIDTH } from '../../constants.js';
import { TABLE_VIEW_COLUMNS } from '../../services/store.js';
import { closeColumnMenu, clearHeaderSelection } from '../ui-functions-click/column-menu.js';
import { showTooltipFor, hideTooltip } from '../tooltip.js';
import { applyColumnWidths, columnWidthPx } from './apply-column-widths.js';
import { syncScrollbarWidth } from './table-scrollbar-sync.js';

/**
 * Re-parks the bar when the page is re-laid-out under it. #output is watched rather than the
 * table, because it is declared in index.html and so survives the renders that replace the
 * table wholesale. Only connected while the bar is on screen.
 */
const _layoutObserver = new ResizeObserver(() => parkBar());

let _bar = null;      // the element from index.html, looked up on first use
let _prop = null;     // the column the bar belongs to, null when hidden
let _cell = null;     // the header cell it is parked against
let _startX = 0;      // drag origin
let _startWidth = 0;

/**
 * @returns {HTMLElement|null}
 */
function barElement() {
    if (!_bar) _bar = document.getElementById('column-resizer');
    return _bar;
}

/**
 * @param {string} property
 * @returns {HTMLElement|null} The header cell for that column, if the table is rendered.
 */
function headerCellFor(property) {
    return document.querySelector(`.note-table-cell-header[data-property="${CSS.escape(property)}"]`);
}

/**
 * Parks the bar against the right edge of the cell it belongs to. It ends where the cell
 * ends, covering the cell's own border from the inside, so it never bleeds into the column
 * next door.
 * @returns {void}
 */
function parkBar() {
    const bar = barElement();
    if (!bar || !_cell) return;

    const rect = _cell.getBoundingClientRect();
    bar.style.left = `${rect.right - bar.offsetWidth}px`;
    bar.style.top = `${rect.top}px`;
    bar.style.height = `${rect.height}px`;
}

/**
 * Takes the bar off screen and forgets its column. The single exit — every path that ends a
 * resize comes through here, which is what keeps the listener bookkeeping honest.
 * @returns {void}
 */
function hideResizer() {
    const bar = barElement();
    if (bar) bar.classList.remove('visible');

    document.removeEventListener('scroll', parkBar, true);
    _layoutObserver.disconnect();
    _prop = null;
    _cell = null;
}

/**
 * Shows the resize bar on the column the menu was opened against.
 *
 * The property has to be read before closing, since closeColumnMenu clears it. Same shape as
 * the sort and search items next to it in the menu.
 * @returns {void}
 */
export function handleColumnResizeActivate() {
    const property = document.getElementById('column-menu')?.dataset.property;
    const bar = barElement();
    if (!property || !bar) return;

    closeColumnMenu();
    clearHeaderSelection(); // the bar marks the column from here on

    const cell = headerCellFor(property);
    if (!cell) return;

    _prop = property;
    _cell = cell;
    bar.classList.add('visible'); // before parking, so offsetWidth is measurable
    parkBar();

    document.addEventListener('scroll', parkBar, true);
    _layoutObserver.observe(document.getElementById('output'));

    showTooltipFor(bar);
}

/**
 * Re-parks the bar after a render has replaced the header it was sitting on. Nothing else
 * dismisses the bar, so a re-render moves it to the same column's new cell rather than
 * hiding it.
 *
 * The one exception is a render that leaves no cell to park against — another view, or the
 * empty state a filter matching nothing puts up. The bar belongs to a table column, so it
 * goes when that column does; a fixed bar left floating over the cards view would be worse
 * than the rule.
 * @returns {void}
 */
export function reparkColumnResizer() {
    if (!_prop) return;

    const cell = headerCellFor(_prop);
    if (!cell) {
        hideResizer();
        return;
    }

    _cell = cell;
    parkBar();
}

/**
 * Starts a drag. Pointer capture routes the rest of the gesture back to the bar, including
 * when the pointer leaves it or the window.
 * @param {PointerEvent} evt
 * @returns {void}
 */
function handleResizeStart(evt) {
    if (!_prop || !evt.isPrimary) return;

    evt.preventDefault(); // no text selection, no native drag
    const bar = barElement();
    bar.setPointerCapture(evt.pointerId);

    _startX = evt.clientX;
    _startWidth = columnWidthPx(TABLE_VIEW_COLUMNS.current_props.find(p => p.name === _prop));

    hideTooltip();

    bar.addEventListener('pointermove', handleResizeMove);
    bar.addEventListener('pointerup', endDrag);
    bar.addEventListener('pointercancel', endDrag);
}

/**
 * @param {PointerEvent} evt
 * @returns {void}
 */
function handleResizeMove(evt) {
    const width = Math.max(MIN_COLUMN_WIDTH, _startWidth + (evt.clientX - _startX));
    TABLE_VIEW_COLUMNS.widthOverrides.set(_prop, width);
    applyColumnWidths(TABLE_VIEW_COLUMNS.current_props);
    parkBar(); // the edge just moved, so the bar follows it
}

/**
 * Ends the drag, and with it the bar: a press and a release is what puts it away.
 * @returns {void}
 */
function endDrag() {
    const bar = barElement();
    bar.removeEventListener('pointermove', handleResizeMove);
    bar.removeEventListener('pointerup', endDrag);
    bar.removeEventListener('pointercancel', endDrag);

    hideResizer();
    syncScrollbarWidth(); // the table is a different width now
}

/**
 * Wires up the bar. It is a fixed singleton from index.html rather than rendered markup, so
 * it gets its listener directly, the way #tooltip and #ac-proxy do.
 * @returns {void}
 */
export function initColumnResizer() {
    barElement()?.addEventListener('pointerdown', handleResizeStart);
}
