/**
 * @file Drag a row up or down the column picker to reorder it.
 *
 * Pointer events, not native HTML5 drag and drop. The native API was tried first and is dead on
 * touch — a finger fires no drag events at all — which is the same wall table-col-resize.js hit.
 * Pointer events cover mouse, trackpad and finger in one path.
 *
 * A finger must rest on the grip before it lifts anything (TOUCH_HOLD_MS); a mouse does not.
 *
 * All three handlers are registered in event-listeners-add.js with everything else: the grip
 * starts a drag through its data-action, and the move and end handlers sit on the document for
 * the life of the page, doing nothing until there is a row in hand. They cannot be reached by
 * data-action themselves — once a drag is under way the pointer is over whatever the list has
 * shuffled under it, not over the grip — so they are registered the way the other document-wide
 * handlers there are, and read _row to decide whether the event is theirs.
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

/* A finger has to rest on the grip this long before it picks a row up. Without it, a touch that
   lands on a grip can only ever be a drag — the grip declares touch-action: none, so the browser
   never takes the gesture for a scroll — and swiping to read down the list reorders the columns
   by accident. A mouse press has no such ambiguity and stays immediate. */
const TOUCH_HOLD_MS = 250;

/* How far a finger may stray during that hold and still be holding rather than swiping. */
const HOLD_TOLERANCE_PX = 8;

let _row = null;       // the row being carried, null the rest of the time
let _pending = null;   // a touch waiting out TOUCH_HOLD_MS: { grip, x, y, timer }

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
    return [..._row.parentElement.children].find(row => {
        if (row === _row) return false;
        const { top, bottom } = row.getBoundingClientRect();
        return clientY >= top && clientY <= bottom;
    });
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

    const others = [..._row.parentElement.children].filter(row => row !== _row);
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
 * Abandons a touch that was waiting out the hold.
 * @returns {void}
 */
function cancelPending() {
    if (!_pending) return;
    clearTimeout(_pending.timer);
    _pending = null;
}

/**
 * Lifts the row out of the list and into the hand.
 * @param {HTMLElement} grip
 * @returns {void}
 */
function beginDrag(grip) {
    _row = grip.closest('.info-modal-row');
    _row.classList.add('is-dragging');

    // The grip travels with the row, so its own tooltip would otherwise surface over the list
    // partway through the drag.
    setTooltipSuppressed(true);
}

/**
 * Takes the press on a grip. A mouse picks the row up at once; a finger has to hold still for
 * TOUCH_HOLD_MS first, so that swiping across a grip scrolls past it rather than moving a column.
 * @param {PointerEvent} evt
 * @param {HTMLElement} grip - The grip carrying the data-action.
 * @returns {void}
 */
export function handleColumnReorderStart(evt, grip) {
    if (!evt.isPrimary || evt.button !== 0) return;

    evt.preventDefault();   // no focus ring, no text selection, no synthesised mouse events

    if (evt.pointerType !== 'touch') {
        beginDrag(grip);
        return;
    }

    _pending = {
        grip,
        x: evt.clientX,
        y: evt.clientY,
        timer: setTimeout(() => {
            const { grip: held } = _pending;
            _pending = null;
            beginDrag(held);
        }, TOUCH_HOLD_MS),
    };
}

/**
 * Carries the held row and shuffles the list under it. Every pointer move on the page reaches
 * this, so it leaves immediately unless a row is actually in hand.
 * @param {PointerEvent} evt
 * @returns {void}
 */
export function handleColumnReorderMove(evt) {
    // Still deciding whether this touch is a hold or a swipe. Straying past the tolerance settles
    // it: the finger is travelling, so it was never reaching for a column.
    if (_pending) {
        if (Math.hypot(evt.clientX - _pending.x, evt.clientY - _pending.y) > HOLD_TOLERANCE_PX) {
            cancelPending();
        }
        return;
    }

    if (!_row) return;

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
 * Lets the held row go. Reached by every pointerup and pointercancel on the page, so like the
 * move handler it leaves unless there is something to put down.
 * @returns {void}
 */
export function handleColumnReorderEnd() {
    cancelPending();   // lifted before the hold was up: a tap, not a drag
    if (!_row) return;

    // Class first: it is what has been holding the transition off, so clearing the offset after
    // it settles the row into its slot instead of snapping it there.
    _row.classList.remove('is-dragging');
    _row.style.transform = '';
    _row = null;
    setTooltipSuppressed(false);
}
