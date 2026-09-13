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
 */

const TEXT = 'cell-date-text';

/**
 * A Date as `yyyy-mm-dd`, using local getters.
 *
 * Deliberately not toISOString(), which converts to UTC first and so shifts the day either side of
 * midnight for a value the parser read as local time.
 *
 * @param {Date} date
 * @returns {string}
 */
function toIsoDate(date) {
    return date.getFullYear()
        + '-' + String(date.getMonth() + 1).padStart(2, '0')
        + '-' + String(date.getDate()).padStart(2, '0');
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
 * @param {HTMLElement} cell - The expanded cell.
 * @returns {void}
 */
export function openDateEditor(cell) {
    const text = cell.textContent.trim();
    const asDate = new Date(text);
    const iso = text && !isNaN(asDate) ? toIsoDate(asDate) : '';

    cell.textContent = '';

    const span = document.createElement('span');
    span.className = TEXT;
    span.setAttribute('contenteditable', 'plaintext-only');
    span.textContent = text;
    cell.append(span);

    // The input is the value holder and the button opens it: a visible date input would be a second
    // field of dd/mm/yyyy segments duplicating the text beside it. It is rendered rather than
    // hidden because showPicker() needs a box to anchor the calendar to — see cell-date-editor.css.
    cell.insertAdjacentHTML('beforeend',
        `<button class="cell-date-pick" data-action="cell-date-pick" tabindex="-1"` +
        ` aria-label="pick a date" data-tip="pick a date">` +
        `<svg class="type-glyph cell-date-glyph" aria-hidden="true"><use href="#icon-type-date"></use></svg>` +
        `</button>` +
        `<input type="date" class="cell-date-input" data-action="cell-date-set" tabindex="-1" value="${iso}">`);

    span.focus();
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
 * Writes a picked date into the cell's text, replacing whatever was there — a time component
 * included, since the picker deals in days. Not silent: the text beside the picker is what changes,
 * so what would be written is on screen with the caret right there to undo it.
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
