import { COLOR_NAMES, HTML_COLOR_NAMES } from '../../constants.js';
import { getEditorElement } from '../../editing/manage-unsaved-changes.js';
import { saveCursorOffset, restoreCursorOffset, applyColorToEditor } from '../../editing/color-pick-apply.js';
import { handleSaveFileCopy } from './save-file-copy.js';
import { decodeModalHtml } from '../../services/file-save.js';

let storedCursorOffset = null;
let pendingSavedOffset = 0;

/**
 * Saves the current cursor offset. Called on mousedown of the colour-pick button,
 * before the click moves focus away from the editor.
 */
export function captureEditorCursorOffset() {
    const editorEl = getEditorElement();
    if (!editorEl) return;
    if (!window.getSelection().rangeCount) return;
    storedCursorOffset = saveCursorOffset(editorEl);
}

/**
 * Resets the stored cursor offset to null. Called when the file content modal closes
 * so stale offsets from a previous file do not bleed into the next one.
 */
export function resetEditorCursorOffset() {
    storedCursorOffset = null;
}

/**
 * @param {string} name
 * @returns {HTMLButtonElement}
 */
function makeCircleButton(name) {
    const btn = document.createElement('button');
    btn.className = 'color-circle';
    btn.dataset.action = 'color-circle-pick';
    btn.dataset.colorValue = name;
    btn.title = name;
    if (name !== 'nocolor') btn.style.backgroundColor = name;
    return btn;
}

function buildColorPickerContent() {
    const dialog = document.getElementById('modal-color-picker');
    const container = document.getElementById('color-picker-content');

    // Reset expanded state on each open
    dialog.classList.remove('expanded');
    const expandBtn = document.getElementById('color-picker-expand-btn');
    expandBtn.setAttribute('aria-expanded', 'false');
    expandBtn.title = 'Show more colours';

    // Row 1: nocolor first, then the curated COLOR_NAMES
    const row1 = document.createElement('div');
    row1.className = 'color-circles-row';
    row1.appendChild(makeCircleButton('nocolor'));
    for (const name of COLOR_NAMES) {
        row1.appendChild(makeCircleButton(name));
    }

    // Row 2: remaining HTML named colours, filtered and pre-ordered by hue
    const existing = new Set(COLOR_NAMES.map(n => n.toLowerCase()));
    const extra = HTML_COLOR_NAMES.filter(n => !existing.has(n));
    const extraWrapper = document.createElement('div');
    extraWrapper.id = 'color-picker-extra';
    const row2 = document.createElement('div');
    row2.className = 'color-circles-row color-circles-row--extra';
    for (const name of extra) {
        row2.appendChild(makeCircleButton(name));
    }
    extraWrapper.appendChild(row2);

    container.innerHTML = '';
    container.appendChild(row1);
    const divider = document.createElement('hr');
    divider.className = 'color-picker-divider';
    container.appendChild(divider);
    container.appendChild(extraWrapper);
}

/**
 * Opens the colour picker dialog. Uses the cursor position captured on mousedown;
 * falls back to end of file if the editor was never focused.
 */
export function handleEditorColorPick() {
    const editorEl = getEditorElement();
    if (!editorEl) return;
    if (document.activeElement === editorEl) captureEditorCursorOffset();
    pendingSavedOffset = storedCursorOffset !== null
        ? storedCursorOffset
        : decodeModalHtml(editorEl.innerHTML).length;
    buildColorPickerContent();
    document.getElementById('modal-color-picker').showModal();
}

/**
 * Applies the chosen colour, restores cursor, and saves the file.
 * @param {Event} _evt
 * @param {Element} actionEl
 */
export function handleColorCirclePick(_evt, actionEl) {
    const colorName = actionEl.dataset.colorValue;
    document.getElementById('modal-color-picker').close();
    const colorValue = colorName === 'nocolor' ? '' : colorName;
    document.getElementById('file-content-header').dataset.color = colorValue;
    document.getElementById('modal-content').dataset.color = colorValue;
    const newOffset = applyColorToEditor(colorName, pendingSavedOffset);
    const editorEl = getEditorElement();
    if (editorEl) {
        editorEl.focus();
        restoreCursorOffset(editorEl, newOffset);
    }
    // handleSaveFileCopy(); remove autosave, uncomment if decide to reimplement
}

/**
 * Closes the picker when the backdrop (the dialog element itself) is clicked.
 * @param {Event} evt
 */
export function handleCloseColorPickerOutside(evt) {
    const dialog = document.getElementById('modal-color-picker');
    if (evt.target === dialog) dialog.close();
}
