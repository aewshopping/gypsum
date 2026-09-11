import { VALUE_TYPES, SEARCH_TYPES, labelFor } from '../../constants.js';
import { TABLE_VIEW_COLUMNS } from '../../services/store.js';

/**
 * @file The column type dialog: which type a column is read as, and how a list column is searched.
 *
 * **One dialog, opened from two places** — a column picker row, and "change type" in the table's
 * column menu. A dialog rather than a menu of its own, for two reasons that point the same way. A
 * header cell opens one menu and one only, so a second menu hanging off it is not available; and
 * showModal() makes everything outside the open dialog inert, so a popover reached from the column
 * picker was painted in the top layer, looked entirely right, and swallowed every click. A dialog
 * is neither a menu nor inert, and it needs no anchor, which is what makes one element serve both
 * callers.
 *
 * Two things are handed in. **A host**, the element carrying `data-type` and `data-search-type`,
 * which a choice is written onto and whose glyph is redrawn; a picker row and a header cell both
 * carry those. **A commit**, what to do once the dialog closes — nothing at all from the picker,
 * where the column dialog already reads its rows on close, and a write to the layout plus a
 * re-render from the header, where there is no dialog to wait for.
 *
 * The header's re-render waits for the close rather than happening per choice because it replaces
 * the header cell, and the host would be an element no longer on the page while the dialog was
 * still open.
 *
 * **Lists of buttons, not <select>s.** A native select's dropdown is painted outside its container,
 * so picking an option counted as a click outside and dismissed what held it.
 */

let _dialog = null;
let _typeList = null;
let _searchList = null;
let _host = null;      // the element carrying the type, written to as choices are made
let _commit = null;    // what the opener wants done once the dialog closes

/**
 * Looks the dialog's elements up on first use, the way the other modals do.
 * @returns {{dialog: HTMLDialogElement, typeList: HTMLElement, searchList: HTMLElement}}
 */
function elements() {
    if (!_dialog) {
        _dialog = document.getElementById('modal-column-type');
        _typeList = document.getElementById('column-type-options');
        _searchList = document.getElementById('column-search-options');
        _typeList.innerHTML = options(VALUE_TYPES, 'column-type-set', true);
        _searchList.innerHTML = options(SEARCH_TYPES, 'column-search-type-set');
        _dialog.addEventListener('close', onClose);
    }
    return { dialog: _dialog, typeList: _typeList, searchList: _searchList };
}

/**
 * One button per entry, written once. The lists in constants.js are the only place a name is
 * legal, so the dialog is built from them rather than from markup that could drift.
 *
 * A type row carries its own glyph, which is what lets the list do without a heading over it: the
 * drawing beside each word is the same one the table header and the picker row show for it.
 * @param {object} group - VALUE_TYPES or SEARCH_TYPES.
 * @param {string} action - The data-action its buttons carry.
 * @param {boolean} [withGlyph=false] - Whether each row is drawn with its type's glyph.
 * @returns {string} HTML for that list's innerHTML.
 */
function options(group, action, withGlyph = false) {
    return Object.values(group)
        .map(entry => {
            const glyph = withGlyph
                ? `<svg class="column-type-option-glyph" aria-hidden="true"><use href="#icon-type-${entry.value}"></use></svg>`
                : '';
            return `<button type="button" class="app-menu-item" data-action="${action}" ` +
                   `data-value="${entry.value}" aria-current="false">${glyph}${entry.label}</button>`;
        })
        .join('');
}

/**
 * Runs the opener's commit once the dialog closes, however it was closed — the close button,
 * Escape and clicking outside all reach it, which is what closedby="any" buys.
 * @returns {void}
 */
function onClose() {
    const commit = _commit;
    _commit = null;
    commit?.(_host);
}

/**
 * Opens the dialog over a column, wherever it was asked for.
 *
 * The title names the column as the layout has it rather than as the schema does, so a renamed
 * column is named here by the name on its header.
 *
 * @param {HTMLElement} host - Carries data-type and data-search-type, and a .type-glyph to redraw.
 * @param {(host: HTMLElement) => void} [commit] - Run once the dialog closes.
 * @returns {void}
 */
export function openColumnTypeDialog(host, commit) {
    const { dialog } = elements();
    const property = host.dataset.property;

    _host = host;
    _commit = commit ?? null;

    document.getElementById('column-type-title').textContent =
        `'${TABLE_VIEW_COLUMNS.columnLayout.get(property)?.label ?? property}' type`;
    markCurrent();
    dialog.showModal();
}

/**
 * Opens the dialog from a column picker row. Nothing is committed: the column dialog reads every
 * row into the layout when it closes, which is what lets reset undo a type change with the rest.
 * @param {MouseEvent} evt
 * @param {HTMLElement} target - The type glyph button on the row.
 * @returns {void}
 */
export function handleColumnTypeMenuOpen(evt, target) {
    openColumnTypeDialog(target.closest('.info-modal-row'));
}

/**
 * @returns {void}
 */
export function handleCloseColumnType() {
    elements().dialog.close();
}

/**
 * The user picked a type.
 * @param {MouseEvent} evt
 * @param {HTMLElement} target - The option button, carrying data-value.
 * @returns {void}
 */
export function handleColumnTypeSet(evt, target) {
    _host.dataset.type = target.dataset.value;
    markCurrent();
    updateGlyph();
}

/**
 * The user picked how the column is searched.
 * @param {MouseEvent} evt
 * @param {HTMLElement} target - The option button, carrying data-value.
 * @returns {void}
 */
export function handleColumnSearchTypeSet(evt, target) {
    _host.dataset.searchType = target.dataset.value;
    markCurrent();
    updateGlyph();
}

/**
 * Ticks the option each list is on, and greys the search list off a list column — nothing else in
 * the app searches by whole values. Disabled rather than hidden, so the dialog keeps one shape
 * whichever column it opened over and does not resize as the type is changed.
 * @returns {void}
 */
function markCurrent() {
    const { typeList, searchList } = elements();
    const isList = _host.dataset.type === VALUE_TYPES.ARRAY.value;

    for (const [list, chosen] of [[typeList, _host.dataset.type], [searchList, _host.dataset.searchType]]) {
        for (const button of list.children) {
            button.setAttribute('aria-current', String(button.dataset.value === chosen));
        }
    }
    for (const button of searchList.children) button.disabled = !isList;
}

/**
 * Redraws the host's glyph for what the column is now, and its tooltip where it has one — a
 * header cell's tooltip belongs to the column menu, so only the picker's glyph button gets one.
 *
 * The symbol's id is built from the stored type name, the same way the picker and the table header
 * build it, so none of the three can draw a different glyph for the same type.
 * @returns {void}
 */
function updateGlyph() {
    const typeLabel = labelFor(VALUE_TYPES, _host.dataset.type);

    _host.querySelector('.type-glyph use').setAttribute('href', `#icon-type-${_host.dataset.type}`);

    const button = _host.querySelector('.column-picker-type');
    if (button) {
        button.dataset.tip = _host.dataset.type === VALUE_TYPES.ARRAY.value
            ? `${typeLabel}, ${labelFor(SEARCH_TYPES, _host.dataset.searchType)}`
            : typeLabel;
    }
}
