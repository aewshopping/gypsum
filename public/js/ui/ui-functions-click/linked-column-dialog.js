// The linked column dialog: opening it empty or over a column, and keeping it up to date as it is used.

import { linkedProperty, automaticHeading } from '../../services/linked-properties.js';
import { readOptionsHtml, viaOptionsHtml, exampleText, headingProblem } from '../ui-functions-table/linked-column-form.js';
import { closeColumnMenu, focusHeaderCell } from './column-menu.js';

/**
 * @file One dialog per linked column, used to create it and to change it later. It holds everything
 * that defines the column — what it shows, which property's links it follows, its name — and it is
 * where the column is deleted. Saving is linked-column-save.js and deleting linked-column-delete.js,
 * the rename dialog's split: this file keeps the dialog honest and writes nothing.
 * See plans/completed/table-linked-properties.md §5.
 *
 * **The name follows the two choices until it is typed in.** While it has not been, the box holds the
 * automatic heading and a choice changes it; once typed in, it stays as typed. Saved untouched, it is
 * stored as null, so the column goes on following its choices after it is re-pointed or a property is
 * renamed. Clearing the box goes back to following.
 */

let _key = null;          // the column being edited, or null while creating one
let _named = false;       // whether the name box holds a name somebody typed
let _fromHeader = false;  // whether focus goes back to the column's header on a cancel

const elements = () => ({
    dialog: document.getElementById('modal-linked-column'),
    title: document.getElementById('linked-column-title'),
    read: document.getElementById('linked-column-read'),
    via: document.getElementById('linked-column-via'),
    name: document.getElementById('linked-column-name'),
    example: document.getElementById('linked-column-example'),
    problem: document.getElementById('linked-column-problem'),
    save: document.getElementById('linked-column-save'),
    remove: document.getElementById('linked-column-delete'),
});

/**
 * Opens the dialog: empty to create a column, or filled in from one to change it.
 *
 * @param {string|null} key - A linked column's key, or null to create one.
 * @param {{fromHeader?: boolean}} [options] - fromHeader: opened from the column's own menu, which
 *   has gone by the time the dialog closes, so a cancel puts focus back on the header itself.
 * @returns {void}
 */
export function openLinkedColumnDialog(key, { fromHeader = false } = {}) {
    const definition = key ? linkedProperty(key) : undefined;
    _key = definition ? key : null;
    _fromHeader = fromHeader && _key !== null;
    _named = typeof definition?.label === 'string';

    const { dialog, title, read, via, name, save, remove } = elements();
    title.textContent = _key ? 'Linked column' : 'New linked column';
    read.innerHTML = readOptionsHtml(definition?.read);
    via.innerHTML = viaOptionsHtml(definition?.via);
    name.value = definition?.label ?? '';
    save.textContent = _key ? 'save' : 'add column';
    remove.hidden = _key === null;
    dialog.returnValue = '';

    followChoices();
    paint();
    dialog.showModal();
    (_key ? name : read).focus();
}

/**
 * "add linked column" in the column picker, which creates a column, and a linked column's glyph on
 * its picker row, which carries its key and opens that column. One handler for both: the key is the
 * only difference.
 * @param {MouseEvent} evt
 * @param {HTMLElement} target - The button, carrying data-property when it is over a column.
 * @returns {void}
 */
export function handleLinkedColumnOpen(evt, target) {
    openLinkedColumnDialog(target.dataset.property ?? null);
}

/**
 * "edit linked column…" in a linked column's header menu.
 * @returns {void}
 */
export function handleLinkedColumnEditFromMenu() {
    const property = document.getElementById('column-menu')?.dataset.property;
    if (!property) return;
    closeColumnMenu();
    openLinkedColumnDialog(property, { fromHeader: true });
}

/**
 * Either select changed: the name follows if nobody has typed one, and the lines under it are
 * worked out again.
 * @returns {void}
 */
export function handleLinkedColumnSelect() {
    followChoices();
    paint();
}

/**
 * A keystroke in the name box. A name that is empty or reads as the automatic one is not a name
 * somebody chose, so the column keeps following its choices.
 * @returns {void}
 */
export function handleLinkedColumnNameInput() {
    const { name } = elements();
    const typed = name.value.trim();
    _named = typed !== '' && typed !== automatic();
    paint();
}

/**
 * Enter in the name box presses save when save can be pressed. Bound to the document beside the
 * rename dialog's own, which is the precedent.
 * @param {KeyboardEvent} evt
 * @returns {void}
 */
export function handleLinkedColumnKeydown(evt) {
    if (evt.key !== 'Enter' || evt.target.id !== 'linked-column-name') return;
    evt.preventDefault();
    const { save } = elements();
    if (!save.disabled) save.click();
}

/**
 * Cancel and the close button. Nothing is applied until save, so closing is enough.
 * @returns {void}
 */
export function handleLinkedColumnCancel() {
    elements().dialog.close();
}

/**
 * However the dialog closed. Cancelled from a column's menu, focus goes back to that header, since
 * the menu that opened the dialog has gone; from anywhere else the browser returns it for us.
 * @returns {void}
 */
export function handleLinkedColumnClose() {
    const { dialog, read, via } = elements();
    if (dialog.returnValue === '' && _fromHeader) focusHeaderCell(_key);
    // Emptied, as the other dialogs empty their lists: a select left filled from an earlier folder
    // would look exactly like a real one.
    read.innerHTML = '';
    via.innerHTML = '';
}

/**
 * The column the dialog is open over, or null while it is creating one.
 * @returns {string|null}
 */
export function linkedColumnKey() {
    return _key;
}

/**
 * What save was pressed for, with the dialog closed — or null when it cannot be saved after all.
 * Asked again rather than trusted from the button, so nothing is saved that the dialog would refuse.
 * @returns {{key: string|null, definition: {label: string|null, via: string, read: string}}|null}
 */
export function takeLinkedColumnRequest() {
    const { dialog, read, via, name } = elements();
    if (!canSave()) return null;
    const definition = { label: _named ? name.value.trim() : null, via: via.value, read: read.value };
    const key = _key;
    dialog.close('save');
    return { key, definition };
}

/**
 * @returns {string} The automatic heading for the choices as they stand, or '' until both are made.
 */
function automatic() {
    const { read, via } = elements();
    return read.value && via.value ? automaticHeading(via.value, read.value) : '';
}

/**
 * Puts the automatic heading in the name box, unless somebody typed a name there.
 * @returns {void}
 */
function followChoices() {
    if (!_named) elements().name.value = automatic();
}

/**
 * @returns {string} What the column would be headed.
 */
function heading() {
    return elements().name.value.trim() || automatic();
}

/**
 * @returns {boolean}
 */
function canSave() {
    const { read, via } = elements();
    return read.value !== '' && via.value !== '' && headingProblem(heading(), _key) === null;
}

/**
 * The line under the name box — the example, or why the name cannot be used — and whether save can
 * be pressed. The two lines take turns in one place and both stay laid out, the rename dialog's
 * arrangement, so the dialog keeps its size.
 * @returns {void}
 */
function paint() {
    const { read, via, example, problem, save } = elements();
    const reason = read.value && via.value ? headingProblem(heading(), _key) : null;

    example.textContent = exampleText(via.value, read.value);
    problem.textContent = reason ?? '';
    problem.hidden = reason === null;
    example.hidden = reason !== null;
    save.disabled = !canSave();
}
