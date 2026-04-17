import { popUndo, popRedo } from './undo-state.js';
import { applyChange, invertChange } from './apply-change.js';
import { setSelectionRange } from './dom-index-map.js';

/**
 * @file User-facing undo/redo operations. Invoked from the keydown delegate
 * when Mod-Z / Mod-Y / Shift-Mod-Z fires inside the editor. No-op silently
 * when the respective stack is empty.
 */

/**
 * Pops the tail of `done`, applies its inverse, and restores selectionBefore.
 * @returns {boolean} true if an undo was applied.
 */
export function performUndo() {
    const tx = popUndo();
    if (!tx) return false;

    const inverse = invertChange(tx.change);
    applyChange(inverse, tx.selectionBefore.from);
    restoreSelection(tx.selectionBefore);
    return true;
}

/**
 * Pops the tail of `undone`, re-applies the original change, and restores
 * selectionAfter.
 * @returns {boolean} true if a redo was applied.
 */
export function performRedo() {
    const tx = popRedo();
    if (!tx) return false;

    applyChange(tx.change, tx.selectionAfter.from);
    restoreSelection(tx.selectionAfter);
    return true;
}

/**
 * Restores a non-collapsed selection after applyChange placed the caret.
 * @param {{from: number, to: number}} sel
 * @returns {void}
 */
function restoreSelection(sel) {
    if (sel.from === sel.to) return;  // caret already placed by applyChange
    const preEl = document.querySelector('#modal-content-text .text-editor');
    if (preEl) setSelectionRange(preEl, sel.from, sel.to);
}
