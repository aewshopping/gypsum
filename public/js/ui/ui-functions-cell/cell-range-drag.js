import { extendRange } from './cell-range.js';

/**
 * @file Dragging out a range of table cells with the pointer.
 *
 * **A drag is a press whose pointer reaches a different cell before it is released.** There is no
 * distance to cross: the grid is the threshold, and a wobble inside one cell is still a click.
 *
 * Opening a cell stays on click, which needs no help to tell the two apart: the browser fires a
 * click only where the press and the release land on the same element, so a press in one cell let go
 * in another clicks their row, which carries no data-action. The one case it does not cover is a
 * drag that comes back to where it began — see pressCrossedCells().
 *
 * **Focus does not move during a drag.** The press focuses the start cell, as any press does, and
 * that cell is the range's anchor. Focusing each cell crossed would also have the table scrolled to
 * reveal it, and put a different cell under the pointer.
 *
 * A finger is left alone: on a touch screen a drag across the table is how it scrolls.
 */

let start = null;   // the cell the press landed on, while a drag may be under way
let over = null;    // the cell the pointer was over last
let crossed = false;

/**
 * Pointerdown anywhere: a drag may start here, if the press is on a table cell — or on anything
 * inside one, a link included.
 * @param {PointerEvent} evt
 * @returns {void}
 */
export function handleRangeDragStart(evt) {
    crossed = false;
    const cell = evt.target.closest?.('.list-table .note-table-cell');
    // A press inside an open cell belongs to its caret, and to the text it selects.
    if (!cell || evt.button !== 0 || evt.pointerType === 'touch' || cell.classList.contains('is-expanded')) return;
    start = over = cell;
}

/**
 * Pointermove anywhere: grows the range when the pointer reaches another cell. Leaves at once when no
 * drag is under way, or when the pointer is still over the cell it was over last — so the work is
 * per cell crossed, not per move.
 * @param {PointerEvent} evt
 * @returns {void}
 */
export function handleRangeDragMove(evt) {
    if (!start) return;
    const cell = evt.target.closest?.('.list-table .note-table-cell');
    if (!cell || cell === over) return;

    over = cell;
    crossed = true;
    extendRange(start, cell);
}

/**
 * Pointerup or pointercancel: the drag is over, and the range stays as it was drawn.
 * @returns {void}
 */
export function handleRangeDragEnd() {
    start = over = null;
}

/**
 * Whether the last press reached another cell before it was released.
 *
 * Asked by the click that follows it. Pressed in one cell, dragged to another and let go back where
 * it began, the press and the release are on the same cell and the browser clicks it — which would
 * open a cell the user was only dragging from.
 * @returns {boolean}
 */
export function pressCrossedCells() {
    return crossed;
}
