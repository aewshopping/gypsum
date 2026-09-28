import { appState } from '../../services/store.js';
import { isLinkedKey, linkedProperty } from '../../services/linked-properties.js';
import { copyTargetProblem, keysIgnoringCase } from '../../services/property-name.js';
import { copySources, copyForecast, filesPhrase } from '../../editing/property-forecast.js';
import { isCopyableSource, sourceHeading } from '../../editing/copy-source-value.js';
import { closeColumnMenu, focusHeaderCell } from './column-menu.js';

/**
 * @file The copy dialog: which property a column is copied into. The dialog is its own confirmation,
 * as the rename dialog is — the line under the text box says why a name cannot be used, or what
 * copying will do, overwrites included, and the button is only pressable when it can be done. The
 * copy itself is column-copy-property.js. See plans/completed/table-copy-column.md §4.
 */

let _source = null;
let _linked = null;
let _keys = null;
let _sources = null;

const elements = () => ({
    dialog: document.getElementById('modal-column-copy'),
    input: document.getElementById('column-copy-input'),
    label: document.getElementById('column-copy-label'),
    names: document.getElementById('column-copy-names'),
    forecast: document.getElementById('column-copy-forecast'),
    problem: document.getElementById('column-copy-problem'),
    confirm: document.getElementById('column-copy-confirm'),
});

/**
 * "copy column…" in the column menu: opens the dialog over the menu's column. A linked column opens
 * with the name it was last copied to, selected, so typing replaces it and Enter copies again. §4.1.
 * @returns {void}
 */
export function handleColumnCopyOpen() {
    const property = document.getElementById('column-menu')?.dataset.property;
    if (!property || !isCopyableSource(property) || appState.bulkWriteInFlight) return;
    closeColumnMenu();

    _source = property;
    _linked = linkedProperty(property) ?? null;
    _keys = keysIgnoringCase(appState.myFiles);
    // Worked out once: what each note would copy does not depend on the name typed.
    _sources = copySources(property);

    const { dialog, input, label, names, forecast } = elements();
    label.textContent = `copy "${sourceHeading(_source)}" into`;
    // Something under a pre-filled name that is refused at once, such as a column since re-pointed.
    forecast.textContent = forecastText('', null);
    names.replaceChildren(...suggestions().map(name => Object.assign(document.createElement('option'), { value: name })));
    input.value = _linked?.copyTo ?? '';
    dialog.returnValue = '';
    paint();
    dialog.showModal();
    input.focus();
    input.select();
}

/**
 * Every keystroke in the text box: the line under it, and whether copy can be pressed.
 * @returns {void}
 */
export function handleColumnCopyInput() {
    paint();
}

/**
 * Enter in the text box presses copy when copy can be pressed, and otherwise does nothing — the line
 * already says why. Escape needs nothing here: it is the dialog's own cancel.
 * @param {KeyboardEvent} evt
 * @returns {void}
 */
export function handleColumnCopyKeydown(evt) {
    if (evt.key !== 'Enter' || evt.target.id !== 'column-copy-input') return;
    evt.preventDefault();
    const { confirm } = elements();
    if (!confirm.disabled) confirm.click();
}

/**
 * Cancel and the close button.
 * @returns {void}
 */
export function handleColumnCopyCancel() {
    elements().dialog.close();
}

/**
 * The dialog has closed, however it was closed. Cancelled, focus goes back to the column's header.
 * @returns {void}
 */
export function handleColumnCopyClose() {
    if (elements().dialog.returnValue !== 'copy' && _source) focusHeaderCell(_source);
}

/**
 * What copy was pressed for, with the dialog closed — or null when it cannot be done after all.
 * @returns {{source: string, target: string}|null}
 */
export function takeCopyRequest() {
    const { dialog, input } = elements();
    const target = input.value.trim();
    if (!canCopy(target)) return null;
    dialog.close('copy');
    return { source: _source, target };
}

/**
 * @param {string} typed
 * @returns {boolean}
 */
function canCopy(typed) {
    if (copyTargetProblem(_source, typed, _keys, _linked) !== null) return false;
    const { create, overwrite } = copyForecast(_sources, typed.trim());
    return create + overwrite > 0;
}

/**
 * Shows the refusal or the forecast under the text box, and names and enables the button, from what
 * is typed now.
 * @returns {void}
 */
function paint() {
    const { input, forecast, problem, confirm } = elements();
    const typed = input.value.trim();
    const reason = typed === '' ? null : copyTargetProblem(_source, typed, _keys, _linked);

    // The two lines take turns in one place, and both stay laid out, so the dialog keeps its size.
    // A refused name leaves the last forecast underneath rather than writing a shorter one, or the
    // dialog would shrink as a name was refused and grow as it was allowed again.
    problem.textContent = reason ?? '';
    problem.hidden = reason === null;
    forecast.hidden = reason !== null;

    const counts = typed === '' || reason ? null : copyForecast(_sources, typed);
    if (!reason) forecast.textContent = forecastText(typed, counts);

    const overwriting = counts !== null && counts.overwrite > 0;
    confirm.textContent = !counts ? 'copy'
        : overwriting ? `overwrite ${filesPhrase(counts.overwrite)}`
        : `copy into ${filesPhrase(counts.create)}`;
    confirm.classList.toggle('btn-action-danger', overwriting);
    confirm.disabled = counts === null || counts.create + counts.overwrite === 0;
}

/**
 * The forecast line: what happens to the notes with something to copy, and what is left alone.
 * @param {string} typed
 * @param {{create: number, overwrite: number, match: number, exists: boolean}|null} counts - Null
 *   while no name is typed.
 * @returns {string}
 */
function forecastText(typed, counts) {
    const { values, nothing, locked } = _sources;
    if (values.size === 0) {
        return locked > 0
            ? `"${sourceHeading(_source)}" cannot be copied: every note with a value has front matter that could not be read.`
            : `"${sourceHeading(_source)}" has nothing to copy: no note has a value in it.`;
    }

    const writes = counts ? counts.create + counts.overwrite : 0;
    const what = !counts
        ? `Copies this column into a property of ${filesPhrase(values.size)}.`
        : writes === 0
            ? `Every file already holds these values in "${typed}".`
            : counts.exists
                ? `Writes "${typed}" in ${filesPhrase(writes)}${detail(counts)}.`
                : `Creates "${typed}" in ${filesPhrase(writes)}.`;
    return [
        what,
        ...(nothing > 0 ? [`${filesPhrase(nothing)} ${nothing === 1 ? 'has' : 'have'} nothing to copy and ${nothing === 1 ? 'is' : 'are'} left as ${nothing === 1 ? 'it is' : 'they are'}.`] : []),
        ...(locked > 0 ? [`${filesPhrase(locked)} will be skipped: their front matter could not be read.`] : []),
        ...(writes > 0 ? ['You can undo this.'] : []),
    ].join(' ');
}

/**
 * ` — 12 to overwrite, 8 already match`, leaving out a part that is nought.
 * @param {{overwrite: number, match: number}} counts
 * @returns {string}
 */
function detail({ overwrite, match }) {
    const parts = [
        ...(overwrite > 0 ? [`${overwrite} to overwrite`] : []),
        ...(match > 0 ? [`${match} already match`] : []),
    ];
    return parts.length > 0 ? ` — ${parts.join(', ')}` : '';
}

/**
 * The folder's own properties that can be copied into, for the name box's suggestions.
 * @returns {string[]}
 */
function suggestions() {
    return [...appState.myFilesProperties.keys()]
        .filter(name => !isLinkedKey(name) && copyTargetProblem(_source, name, _keys, _linked) === null)
        .sort((a, b) => a.localeCompare(b));
}
