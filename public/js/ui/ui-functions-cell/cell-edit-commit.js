import { applyCellEdits } from '../../editing/save-cell-edit.js';

/**
 * @file Someone has finished editing a cell.
 *
 * Thin on purpose: it captures, it compares, and it hands over. What may be written and how is
 * save-cell-edit.js's business; what an open cell offers is cell-editor.js's.
 */

/**
 * Writes what a cell now holds back into its note, unless it is what the cell opened with.
 *
 * **Capture is one expression for every type** — `cell.textContent` — because an editable cell
 * holds nothing but escaped text, a date cell's picker and button contribute none, and a cell
 * carrying a mismatch note never took a caret in the first place. A per-type reader would be the
 * mistake: a type needing one would mean the cell had stopped being the value. See §4.4.
 *
 * **The change test is text against text**, the cell now against the text stashed when it opened.
 * Not the captured value against the file's: rendering a value and capturing it back is not a round
 * trip — a list of numbers comes back as a list of strings, a padded item comes back trimmed — so
 * comparing values would report a change on a cell nobody touched. See §4.5.
 *
 * Nothing waits for the write. The table is redrawn from the file when it lands, which is the
 * existing display path; a failure past this point is the File System API's, so it is reported.
 *
 * @param {HTMLElement} cell - The cell being closed.
 * @returns {void}
 */
export function commitCellEdit(cell) {
    const opened = cell.dataset.openedText;
    if (opened === undefined || cell.textContent === opened) return;

    applyCellEdits([{
        internalId: cell.closest('.note-table').dataset.vtId,
        property: cell.dataset.prop,
        text: cell.textContent,
    }]).catch(error => console.error('Failed to write a cell edit:', error));
}
