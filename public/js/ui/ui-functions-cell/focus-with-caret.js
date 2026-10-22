/**
 * Focuses an editable element and makes sure there is a caret in it.
 *
 * **focus() alone is not enough, and the reason is easy to miss: it does nothing at all when the
 * element already has focus.** That is exactly the case when a cell is opened from the keyboard —
 * the arrow keys focused it while it was still a plain div, and Enter then makes that same element
 * editable. It ends up editable and focused with no selection inside it, so nothing can be typed and
 * the arrow keys fall through to the page, which scrolls.
 *
 * A selection already inside the element is left alone, and the caret only goes to the end when
 * there was nothing to keep. **A click does not leave one today**: closed cells are
 * `user-select: none`, so the press that opens a cell puts no selection in it, and a cell opened
 * with the mouse gets its caret at the end exactly as one opened from the keyboard does.
 *
 * **That question has to be asked before focusing**, not after: focusing an element that did not
 * have focus puts a caret at the start of it, which is indistinguishable afterwards from the one a
 * click left — and a date cell, whose editor is a span built the moment it opens, always looked like
 * the click case.
 *
 * @param {HTMLElement} target - The element that has just been made editable.
 * @returns {void}
 */
export function focusWithCaret(target) {
    const selection = getSelection();
    const caretIsInside = selection.anchorNode && target.contains(selection.anchorNode);

    target.focus();
    if (caretIsInside) return;

    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);

    selection.removeAllRanges();
    selection.addRange(range);
}
