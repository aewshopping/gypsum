/**
 * @file The sort modal, opened from the sort button in the controls panel: which property the files
 * are sorted by, which way, and what type that property is read as — the three things the sort
 * dropdown, the direction arrow and the types modal used to be visited for separately. A type saved
 * for a property the folder no longer has is listed too, with a bin, as the types modal listed it.
 *
 * A UI over the sort rather than a sort of its own: every press goes through applySortAndRender, the
 * choke point the column menu shares, and nothing here stores anything.
 */

import { appState } from '../../services/store.js';
import { setPropertyType } from '../../services/property-type.js';
import { savePropertyTypes } from '../../table-layouts/layout-file.js';
import { renderSortList } from '../ui-functions-render/render-sort-list.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { applySortAndRender } from './sort-object.js';
import { showWarningModal } from './warning-modal.js';
import { openColumnTypeDialog } from './column-type-set.js';

/**
 * @returns {HTMLDialogElement}
 */
function dialog() {
    return document.getElementById('modal-sort');
}

/**
 * @returns {HTMLElement}
 */
function listElement() {
    return document.getElementById('sort-list');
}

/**
 * Builds the list fresh and opens the modal. Fresh because the properties are the loaded folder's
 * and the types may have been changed elsewhere since it was last open.
 * @returns {void}
 */
export function handleOpenSortModal() {
    listElement().innerHTML = renderSortList();
    dialog().showModal();
}

/**
 * @returns {void}
 */
export function handleCloseSortModal() {
    dialog().close();
}

/**
 * Sorts by the pressed row's property, in the direction the sort already has.
 * @param {MouseEvent} evt
 * @param {HTMLElement} target - The row's name button, carrying data-property.
 * @returns {void}
 */
export function handleSortByProperty(evt, target) {
    applySortAndRender(target.dataset.property, appState.sortState.direction);
}

/**
 * Reverses the sort. Only the sorted row's button can be seen, so this is that row's property.
 * @param {MouseEvent} evt
 * @param {HTMLElement} target - The direction button, carrying data-property.
 * @returns {void}
 */
export function handleSortReverse(evt, target) {
    const reversed = appState.sortState.direction === 'asc' ? 'desc' : 'asc';
    applySortAndRender(target.dataset.property, reversed);
}

/**
 * Opens the type dialog over a row. The row carries data-property, data-type and data-search-type,
 * which is all the dialog asks of a host.
 * @param {MouseEvent} evt
 * @param {HTMLElement} target - The type glyph button.
 * @returns {void}
 */
export function handleSortTypeOpen(evt, target) {
    openColumnTypeDialog(target.closest('.sort-row'), commitSortType);
}

/**
 * Records a row's type once the type dialog closes, and redraws the files behind the modal — re-sorted
 * when it is the property they are sorted by, since the type is what the sort compares by, and
 * otherwise only redrawn, since the type is how its cells are drawn. The list is repainted either
 * way: the type names the row's direction button.
 * @param {HTMLElement} row
 * @returns {void}
 */
function commitSortType(row) {
    const property = row.dataset.property;
    setPropertyType(property, row.dataset.type, row.dataset.searchType);
    savePropertyTypes();

    if (property === appState.sortState.property) applySortAndRender(property, appState.sortState.direction);
    else renderFiles(false);
    listElement().innerHTML = renderSortList();
}

/**
 * Forgets the type saved for a property the loaded folder no longer has, once asked.
 *
 * Through setPropertyType with no type, the forget path, so the one writer stays the one writer. It
 * asks although nothing is at risk — no note is touched and the property has no values left —
 * because it is the same press as the column picker's bin, and a bin that asks in one place and not
 * another is the inconsistency worth avoiding. The repaint takes the row away.
 * @param {MouseEvent} evt
 * @param {HTMLElement} target - The bin, carrying data-property.
 * @returns {Promise<void>}
 */
export async function handleSortTypeForget(evt, target) {
    const property = target.dataset.property;
    const confirmed = await showWarningModal(
        `Forget the type saved for "${property}"? The loaded folder has no values for this property.`,
        'forget type', 'cancel');
    if (!confirmed) return;

    setPropertyType(property);
    savePropertyTypes();
    listElement().innerHTML = renderSortList();
    dialog().focus();
}
