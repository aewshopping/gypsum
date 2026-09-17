/**
 * @file A date cell opens with a caret *and* a picker, and the user chooses which to use.
 *
 * Two controls because they answer different halves of the question: the caret writes exactly what
 * was typed, and the picker cannot produce anything but a plain ISO date. Between them the app
 * never has to reinterpret what someone meant, which is the whole argument in
 * plans/completed/table-cell-editors.md §4.
 *
 * It works because a date cell renders the file's own text (§4.2), so the cell already holds the
 * value the picker seeds from and the caret edits. Nothing has to be looked up.
 *
 * **A `date and time` column opens the same editor with the browser's other picker.** That is the
 * whole difference between the two types here: `datetime-local` asks for a time as well and hands
 * back `2026-03-01T14:30`, where `date` hands back `2026-03-01`. Both are text the parser reads
 * straight back as itself — neither coerces to a number — so the promise that a cell holds the
 * note's own words survives either picker.
 */

import { VALUE_TYPES } from '../../constants.js';
import { focusWithCaret } from './focus-with-caret.js';

const TEXT = 'cell-date-text';

/**
 * A Date as `yyyy-mm-dd`, or `yyyy-mm-ddThh:mm` when the picker wants a time too.
 *
 * Deliberately not toISOString(), which converts to UTC first and so shifts the day either side of
 * midnight for a value the parser read as local time — and would shift the hour of every value that
 * carries one.
 *
 * @param {Date} date
 * @param {boolean} withTime - Whether to append the time of day.
 * @returns {string}
 */
function toIsoDate(date, withTime) {
    const pad = (n) => String(n).padStart(2, '0');
    const day = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());

    return withTime ? `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
}

/**
 * The span a date cell keeps its text in, or null for any other cell.
 *
 * Exported so that putting a cell's text back does not need to know how a date cell is built: its
 * own textContent holds the picker as well, and writing over that would take the button and the
 * input with it.
 *
 * @param {HTMLElement} cell
 * @returns {HTMLElement|null}
 */
export function dateEditorText(cell) {
    return cell.querySelector(`.${TEXT}`);
}

/**
 * Replaces a date cell's text with the editable span, and adds the picker beside it.
 *
 * **The editable region is the span, not the cell.** An input inside a contenteditable container is
 * a known mess — the caret lands beside it and Backspace deletes it — and outside one there is
 * nothing to go wrong. The cell's textContent is unchanged by the swap, since a button contributes
 * no text and an input's value is not text content, so whatever captures a cell edit still reads
 * one expression for every kind of cell.
 *
 * The column's type reaches three things and nothing else: which picker opens, how the cell's
 * current text is seeded into it, and which glyph the button wears. Everything past that is the
 * same editor.
 *
 * @param {HTMLElement} cell - The expanded cell.
 * @param {string} [type=VALUE_TYPES.DATE.value] - The column's type, one of the two date ones.
 * @returns {void}
 */
export function openDateEditor(cell, type = VALUE_TYPES.DATE.value) {
    const withTime = type === VALUE_TYPES.DATETIME.value;
    const text = cell.textContent.trim();
    const asDate = new Date(text);
    const iso = text && !isNaN(asDate) ? toIsoDate(asDate, withTime) : '';

    cell.textContent = '';

    const span = document.createElement('span');
    span.className = TEXT;
    span.setAttribute('contenteditable', 'plaintext-only');
    span.textContent = text;
    cell.append(span);

    // The input is the value holder and the button opens it: a visible date input would be a second
    // field of dd/mm/yyyy segments duplicating the text beside it. It is rendered rather than
    // hidden because showPicker() needs a box to anchor the calendar to — see cell-date-editor.css.
    const label = withTime ? 'pick a date and time' : 'pick a date';
    cell.insertAdjacentHTML('beforeend',
        `<button class="cell-date-pick" data-action="cell-date-pick" tabindex="-1"` +
        ` aria-label="${label}" data-tip="${label}">` +
        `<svg class="type-glyph cell-date-glyph" aria-hidden="true"><use href="#icon-type-${type}"></use></svg>` +
        `</button>` +
        `<input type="${withTime ? 'datetime-local' : 'date'}" class="cell-date-input"` +
        ` data-action="cell-date-set" tabindex="-1" value="${iso}">`);

    focusWithCaret(span);
}

/**
 * Puts a date cell back to plain text, dropping the span, the button and the input at once.
 *
 * **Focus has to come back to the cell.** Keyboard navigation needs the focused element to be the
 * cell itself (`keyboard-navigate.js` tests for `.keyboard-navigable`), and removing the span that
 * held the caret would otherwise drop focus onto the body and kill the arrow keys until something
 * was clicked. Only when the caret was in here: a click elsewhere on the page closes this cell too,
 * and stealing focus back from whatever was clicked would be worse than the problem.
 *
 * Reads the marker in the cell rather than working the type out again, matching what the renderer
 * leaves for cell-expand.js: it reads the cell, not the schema.
 *
 * @param {HTMLElement} cell
 * @returns {void}
 */
export function closeDateEditor(cell) {
    const span = cell.querySelector(`.${TEXT}`);
    if (!span) return;

    const hadFocus = cell.contains(document.activeElement);
    cell.textContent = span.textContent;
    if (hadFocus) cell.focus();
}

/**
 * Opens the browser's own calendar for the cell being edited.
 * @param {MouseEvent} evt
 * @param {HTMLElement} button - The element carrying data-action="cell-date-pick".
 * @returns {void}
 */
export function handleCellDatePick(evt, button) {
    button.parentElement.querySelector('.cell-date-input').showPicker();
}

/**
 * Writes a picked date into the cell's text, replacing whatever was there — including a time the
 * note carried and a `date` column's picker cannot express, since that picker deals in days. Not
 * silent: the text beside the picker is what changes, so what would be written is on screen with
 * the caret right there to undo it.
 *
 * The input's own value is what lands, whichever picker it came from, so a `date and time` column
 * writes `2026-03-01T14:30` — the browser's spelling rather than one of ours.
 *
 * @param {Event} evt
 * @param {HTMLInputElement} input - The element carrying data-action="cell-date-set".
 * @returns {void}
 */
export function handleCellDateSet(evt, input) {
    const span = input.parentElement.querySelector(`.${TEXT}`);
    span.textContent = input.value;
    span.focus();
}
