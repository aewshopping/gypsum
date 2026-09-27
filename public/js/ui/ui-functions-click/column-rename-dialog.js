// The rename dialog: typing a column's new name, and being told as you type whether it can be used.

import { appState } from '../../services/store.js';
import { keysIgnoringCase, renameProblem } from '../../services/property-name.js';
import { propertyForecast, sampleNames, filesPhrase } from '../../editing/property-forecast.js';
import { closeColumnMenu, focusHeaderCell } from './column-menu.js';

/**
 * @file Opens the dialog from "rename column", checks the name on every keystroke, and closes it.
 * It asks the services and decides nothing itself: whether a name can be used is property-name.js's
 * answer, and which notes a rename reaches is property-forecast.js's. Pressing rename is
 * column-rename-property.js. See plans/completed/table-rename-column.md §8.2.
 *
 * The folder's keys and the forecast are worked out once, when the dialog opens: neither depends on
 * what is typed, so each keystroke is one lookup however large the folder.
 */

/** At or above this many notes the dialog says a rename takes a few seconds. The column delete
 * measured about 4s for 1,000 notes, and a rename's write pass costs the same; at 35 the line would
 * only alarm. */
const RENAME_SLOW_AT = 500;

let _from = null;
let _keys = null;
let _forecast = null;

const elements = () => ({
    dialog: document.getElementById('modal-column-rename'),
    input: document.getElementById('column-rename-input'),
    label: document.getElementById('column-rename-label'),
    message: document.getElementById('column-rename-message'),
    confirm: document.getElementById('column-rename-confirm'),
});

/**
 * "rename column" in the column menu: opens the dialog over the menu's column, its name selected so
 * typing replaces it.
 * @returns {void}
 */
export function handleColumnRenameOpen() {
    const property = document.getElementById('column-menu')?.dataset.property;
    if (!property || appState.bulkWriteInFlight) return;
    closeColumnMenu();

    _from = property;
    _keys = keysIgnoringCase(appState.myFiles, property);
    _forecast = propertyForecast(property);

    const { dialog, input, label } = elements();
    label.textContent = `new name for "${property}"`;
    input.value = property;
    dialog.returnValue = '';
    paint();
    dialog.showModal();
    input.focus();
    input.select();
}

/**
 * Every keystroke in the text box: the line under it, and whether rename can be pressed.
 * @returns {void}
 */
export function handleColumnRenameInput() {
    paint();
}

/**
 * Enter in the text box presses rename when rename can be pressed, and otherwise does nothing — the
 * line already says why. Bound to the document beside handleLayoutNameKeydown, the layouts modal's
 * name box being the precedent. Escape needs nothing here: it is the dialog's own cancel.
 * @param {KeyboardEvent} evt
 * @returns {void}
 */
export function handleColumnRenameKeydown(evt) {
    if (evt.key !== 'Enter' || evt.target.id !== 'column-rename-input') return;
    evt.preventDefault();
    const { confirm } = elements();
    if (!confirm.disabled) confirm.click();
}

/**
 * Cancel and the close button.
 * @returns {void}
 */
export function handleColumnRenameCancel() {
    elements().dialog.close();
}

/**
 * The dialog has closed, however it was closed. Cancelled, focus goes back to the column's header,
 * selected, so one more press opens its menu again. A rename puts focus on the header itself once
 * the notes are written, since the header is redrawn by then.
 * @returns {void}
 */
export function handleColumnRenameClose() {
    if (elements().dialog.returnValue !== 'rename' && _from) focusHeaderCell(_from);
}

/**
 * What rename was pressed for, with the dialog closed — or null when the name cannot be used after
 * all. Asked again rather than trusted from the button, so a rename never starts on a name the
 * dialog would refuse.
 * @returns {{from: string, to: string}|null}
 */
export function takeRenameRequest() {
    const { dialog, input } = elements();
    const to = input.value.trim();
    if (!canRename(to)) return null;
    dialog.close('rename');
    return { from: _from, to };
}

/**
 * @param {string} typed
 * @returns {boolean}
 */
function canRename(typed) {
    return _forecast.changing > 0 && typed.trim() !== _from && renameProblem(_from, typed, _keys) === null;
}

/**
 * Writes the line under the text box and the button, from what is typed now.
 * @returns {void}
 */
function paint() {
    const { input, message, confirm } = elements();
    const typed = input.value;
    const problem = renameProblem(_from, typed, _keys);
    const locked = _forecast.changing === 0;

    message.textContent = problem ?? (locked ? lockedText() : forecastText());
    message.classList.toggle('is-warning', Boolean(problem) || locked);
    confirm.disabled = !canRename(typed);
    confirm.textContent = `rename in ${filesPhrase(_forecast.changing)}`;
}

/** @returns {string} */
function forecastText() {
    const { changing, skipped } = _forecast;
    return [
        `Renames the key in ${filesPhrase(changing)}: ${sampleNames(_forecast)}`,
        ...(skipped > 0 ? [`${filesPhrase(skipped)} will be skipped: their front matter could not be read.`] : []),
        'The value in each note stays exactly as it is. You can undo this.',
        ...(changing >= RENAME_SLOW_AT ? ['This can take a few seconds, and the table is locked until it is done.'] : []),
    ].join(' ');
}

/** @returns {string} */
function lockedText() {
    return `"${_from}" cannot be renamed: every note that has it has front matter that could not be read.`;
}
