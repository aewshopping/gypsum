import { COLOR_NAMES } from '../../constants.js';
import { getEditorElement } from '../../editing/manage-unsaved-changes.js';
import { saveCursorOffset, restoreCursorOffset, applyColorToEditor } from '../../editing/color-pick-apply.js';
import { handleSaveFileCopy } from './save-file-copy.js';

let pendingSavedOffset = 0;

function buildColorPickerContent() {
    const container = document.getElementById('color-picker-content');
    const row = document.createElement('div');
    row.className = 'color-circles-row';
    for (const name of COLOR_NAMES) {
        const btn = document.createElement('button');
        btn.className = 'color-circle';
        btn.dataset.action = 'color-circle-pick';
        btn.dataset.colorValue = name;
        btn.title = name;
        if (name !== 'nocolor') btn.style.backgroundColor = name;
        row.appendChild(btn);
    }
    container.innerHTML = '';
    container.appendChild(row);
}

/**
 * Opens the colour picker dialog. Saves the cursor position first.
 */
export function handleEditorColorPick() {
    const editorEl = getEditorElement();
    if (!editorEl) return;
    pendingSavedOffset = saveCursorOffset(editorEl);
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
    handleSaveFileCopy();
}

/**
 * Closes the picker when the backdrop (the dialog element itself) is clicked.
 * @param {Event} evt
 */
export function handleCloseColorPickerOutside(evt) {
    const dialog = document.getElementById('modal-color-picker');
    if (evt.target === dialog) dialog.close();
}
