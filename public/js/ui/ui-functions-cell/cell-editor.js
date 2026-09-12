import { VALUE_TYPES } from '../../constants.js';
import { propertyType, isPropertyEditable } from '../../services/property-type.js';
import { openDateEditor, closeDateEditor } from './cell-date-editor.js';

/**
 * @file What opening a cell gives you, and what closing it takes away.
 *
 * `cell-expand.js` selects, expands and collapses; this decides what an expanded cell actually
 * offers. The two are separate so neither grows into the other, and it is the same shape as
 * property-type.js answering "what type is this column" — one question, one place.
 *
 * See plans/completed/table-cell-editors.md §5.
 */

const NOTE = 'cell-mismatch-note';
const READONLY = 'is-readonly';

/**
 * Whether a cell's value can be written back to its note at all.
 *
 * Four reasons a cell refuses a caret, and they are gathered here rather than spread about because
 * they answer the same question:
 *
 * - **its value does not fit its column** — editing it risks writing back the wrong shape, so it
 *   opens to be read and says why, in the cell as well as in the tooltip
 * - **its value does not fit its column** — a fact about this one cell, which the renderer already
 *   worked out and left on it. Read off the cell rather than computed again, because a cell that
 *   disagreed with its own marker would be very hard to see
 * - **the column cannot be typed into at all** — the app fills it in, or the property does not come
 *   from front matter. That is isPropertyEditable's question, and asking it here rather than
 *   answering it again is what keeps the caret and the header's lock the same decision
 *
 * @param {HTMLElement} cell
 * @returns {boolean}
 */
function isEditable(cell) {
    return !cell.dataset.mismatch && isPropertyEditable(cell.dataset.prop);
}

/**
 * Gives an expanded cell whatever it should offer: a caret, a caret beside a date picker, or
 * nothing but the chance to read a long value.
 *
 * @param {HTMLElement} cell - The cell, already carrying the expanded class.
 * @returns {void}
 */
export function openEditor(cell) {
    // A mismatched cell says why in the cell itself. The sentence is the one already on its tooltip,
    // so the pointer and the touch paths cannot say different things.
    if (cell.dataset.mismatch) {
        cell.insertAdjacentHTML('beforeend', `<span class="${NOTE}">${cell.dataset.tip}</span>`);
    }

    if (!isEditable(cell)) {
        // The dashed outline says "open, but not an editor" — see note-table-cell.css. A class
        // rather than a selector over contenteditable, because a date cell puts that on a child and
        // the stylesheet should not have to know it.
        cell.classList.add(READONLY);
        cell.focus();
        return;
    }

    if (propertyType(cell.dataset.prop) === VALUE_TYPES.DATE.value) {
        openDateEditor(cell);
        return;
    }

    // plaintext-only keeps pasted markup out of a cell that ultimately stands for text in a file.
    // Focusing puts the caret in without a further click.
    cell.setAttribute('contenteditable', 'plaintext-only');
    cell.focus();
}

/**
 * Takes back whatever openEditor gave, leaving the cell as the renderer drew it.
 * @param {HTMLElement} cell
 * @returns {void}
 */
export function closeEditor(cell) {
    closeDateEditor(cell);
    cell.classList.remove(READONLY);
    cell.removeAttribute('contenteditable');
    cell.querySelector(`.${NOTE}`)?.remove();
}

/**
 * Stops Enter putting a line break into a cell that stands for one value.
 *
 * A line break cannot be written to front matter at all — the block is line-based, so a value
 * holding one destroys it — and a date or a number has no use for a second line anyway. A list is
 * the exception: there a break is how you add an item, which flow-list.js reads back.
 *
 * Called from the keydown delegate rather than registered as a data-action, the same arrangement
 * the autocomplete's keys use, because a key is not a click on anything.
 *
 * @param {KeyboardEvent} evt
 * @returns {void}
 */
export function handleCellEditorKeydown(evt) {
    if (evt.key !== 'Enter') return;

    const cell = evt.target.closest?.('.note-table-cell.is-expanded');
    if (!cell || !isEditable(cell)) return;

    if (propertyType(cell.dataset.prop) !== VALUE_TYPES.ARRAY.value) {
        evt.preventDefault();
    }
}
