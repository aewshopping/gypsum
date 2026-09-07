/**
 * @file Drag a row up or down the column picker to reorder it.
 *
 * Pointer events, not native HTML5 drag and drop. The native API was tried first and is dead on
 * touch — a finger fires no drag events at all — which is the same wall table-col-resize.js hit.
 * Pointer events cover mouse, trackpad and finger in one path.
 *
 * The row is carried under the pointer while the rest of the list parts around it. Each move
 * re-inserts it against whichever row the pointer is over, then re-measures it with its offset
 * cleared and translates it back under the pointer. Measuring untransformed every time is what
 * lets the carrying and the reordering coexist: the offset is recomputed from the row's new slot
 * rather than accumulating across the move.
 *
 * The rows parted around it slide rather than jump, by the usual FLIP trick — see reorderAround.
 *
 * Nothing is stored. The order lives in the DOM until the dialog is reopened, which rebuilds the
 * rows from renderColumnPickerList().
 */

import { setTooltipSuppressed } from '../tooltip.js';

let _list = null;   // #column-picker-list, looked up once at init
let _row = null;    // the row being carried, null the rest of the time

/**
 * The row the pointer is over, ignoring the one being carried — that one is translated out of
 * its slot and sits under the pointer by definition, so it would be the only row ever found.
 * Rows are searched by their vertical extent alone: a finger wandering off the side of the
 * dialog should still be dragging.
 *
 * @param {number} clientY
 * @returns {HTMLElement|undefined}
 */
function rowUnder(clientY) {
    return [..._list.querySelectorAll('.modal-row')].find(row => {
        if (row === _row) return false;
        const { top, bottom } = row.getBoundingClientRect();
        return clientY >= top && clientY <= bottom;
    });
}

/**
 * Picks a row up, but only by its grip.
 * @param {PointerEvent} evt
 * @returns {void}
 */
function handlePointerDown(evt) {
    if (!evt.isPrimary || evt.button !== 0) return;

    const grip = evt.target.closest('.modal-row-grip');
    if (!grip) return;

    evt.preventDefault();   // no focus ring, no text selection, no synthesised mouse events

    _row = grip.closest('.modal-row');
    _row.classList.add('is-dragging');

    // The grip travels with the row, so its own tooltip would otherwise surface over the list
    // partway through the drag.
    setTooltipSuppressed(true);

    // Listened for on the document rather than captured on the grip: the row is moved through
    // the DOM as it travels, and moving an element releases the pointer capture it was holding.
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
}

/**
 * Re-inserts the carried row next to the one the pointer is over, and slides whatever the
 * insert displaced into its new slot.
 *
 * A row moved by a reorder moves by reflow, and no transition animates a reflow — it is simply
 * in a new place on the next frame. So each displaced row is measured before the insert, put
 * back where it was with a transform, and released on the next frame: the stylesheet's
 * transition then carries it across. The before position is the row's visual one, transform
 * included, so a row displaced again while still sliding continues from where it looks rather
 * than snapping.
 *
 * @param {HTMLElement} over - The row the pointer is over.
 * @param {boolean} isBelowMidpoint - Whether the pointer is past that row's halfway line.
 * @returns {void}
 */
function reorderAround(over, isBelowMidpoint) {
    const reference = isBelowMidpoint ? over.nextSibling : over;

    // Almost every move lands on some row while leaving the order alone, and inserting a node
    // where it already is still removes and re-inserts it. Doing that per frame restarted every
    // slide below from scratch, so a 0.15s animation was torn down and rebuilt a dozen times
    // instead of playing once — the rows jittering between two positions rather than moving.
    if (reference === _row || _row.nextSibling === reference) return;

    const others = [..._list.querySelectorAll('.modal-row')].filter(row => row !== _row);
    const before = others.map(row => row.getBoundingClientRect().top);

    over.parentNode.insertBefore(_row, reference);

    others.forEach((row, i) => {
        row.style.transition = 'none';
        row.style.transform = '';                       // to wherever the insert just put it
        const dy = before[i] - row.getBoundingClientRect().top;

        if (!dy) {
            row.style.transition = '';                  // this one did not move; give it its
            return;                                     // transition back and leave it alone
        }

        row.style.transform = `translateY(${dy}px)`;
        requestAnimationFrame(() => {
            row.style.transition = '';
            row.style.transform = '';
        });
    });
}

/**
 * @param {PointerEvent} evt
 * @returns {void}
 */
function handlePointerMove(evt) {
    const over = rowUnder(evt.clientY);
    if (over) {
        const { top, height } = over.getBoundingClientRect();
        reorderAround(over, evt.clientY > top + height / 2);
    }

    // Cleared before measuring, so what is read is the slot the row now occupies rather than
    // wherever the last move left it.
    _row.style.transform = '';
    const { top, height } = _row.getBoundingClientRect();
    _row.style.transform = `translateY(${evt.clientY - top - height / 2}px)`;
}

/**
 * @returns {void}
 */
function endDrag() {
    // Class first: it is what has been holding the transition off, so clearing the offset after
    // it settles the row into its slot instead of snapping it there.
    _row.classList.remove('is-dragging');
    _row.style.transform = '';
    _row = null;
    setTooltipSuppressed(false);

    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', endDrag);
    document.removeEventListener('pointercancel', endDrag);
}

/**
 * Wires the picker's list for reordering. #column-picker-list is declared in index.html and only
 * ever has its innerHTML replaced, so one listener on it outlives every repopulation.
 * @returns {void}
 */
export function initColumnReorder() {
    _list = document.getElementById('column-picker-list');
    _list.addEventListener('pointerdown', handlePointerDown);
}
