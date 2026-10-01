// The copy button in the table's control row, and its menu: copy, copy with headers, and paste.

import { copyRange } from '../ui-functions-cell/cell-range-copy.js';
import { pasteFromClipboard } from '../ui-functions-cell/cell-range-paste.js';

/** @returns {HTMLElement|null} */
const menuElement = () => document.getElementById('range-copy-menu');

/**
 * Opens the menu under the copy button. The button is only there while a range is.
 * @returns {void}
 */
export function handleRangeCopyMenuOpen() {
    menuElement()?.showPopover();
}

/**
 * Copies the range, with or without the headings, and closes the menu. The range stays selected.
 * @param {MouseEvent} evt
 * @param {HTMLElement} item - Carrying data-headers="true" for the headings line.
 * @returns {void}
 */
export function handleRangeCopyItem(evt, item) {
    copyRange(item.dataset.headers === 'true');
    menuElement()?.hidePopover();
}

/**
 * Pastes the clipboard into the range, through the same path Ctrl+V takes once the text is read, and
 * closes the menu. plans/completed/table-range-paste.md §3.1.
 * @returns {void}
 */
export function handleRangePasteItem() {
    menuElement()?.hidePopover();
    pasteFromClipboard();
}

/**
 * Mousedown anywhere: a press on the copy button or its menu must not take focus. Focus is the range's
 * anchor, and focus leaving the table ends the range — before the copy it was pressed for could run.
 * Cancelling the mousedown keeps focus in the cell, as the note picker's items do; the click still
 * arrives.
 * @param {MouseEvent} evt
 * @returns {void}
 */
export function handleRangeCopyMouseDown(evt) {
    if (evt.target.closest?.('#range-copy-btn, #range-copy-menu')) evt.preventDefault();
}
