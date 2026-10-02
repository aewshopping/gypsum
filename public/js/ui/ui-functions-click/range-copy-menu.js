// The copy button in the table's control row, and its menu: copy, copy with headers, and clear copied cells.

import { copyRange, clearCopied } from '../ui-functions-cell/cell-range-copy.js';

/** @returns {HTMLElement|null} */
const menuElement = () => document.getElementById('range-copy-menu');

/**
 * Opens the menu under the copy button.
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
 * Takes the outline off the copied cells and empties the clipboard, so the two never disagree, and
 * closes the menu. Shown only while cells are copied.
 * @returns {void}
 */
export function handleRangeCopyClear() {
    clearCopied();
    menuElement()?.hidePopover();
}

/**
 * Mousedown anywhere: a press on the copy or paste button, or the copy menu, must not take focus. Focus
 * is the range's anchor, and focus leaving the table would end the range before the copy or paste it
 * was pressed for could run — and hide the buttons themselves, which show only while a cell has focus.
 * Cancelling the mousedown keeps focus in the cell, as the note picker's items do; the click still
 * arrives.
 * @param {MouseEvent} evt
 * @returns {void}
 */
export function handleRangeCopyMouseDown(evt) {
    if (evt.target.closest?.('#range-copy-btn, #range-paste-btn, #range-copy-menu')) evt.preventDefault();
}
