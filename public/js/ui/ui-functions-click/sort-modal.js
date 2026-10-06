/**
 * @file The sort modal, opened from the sort button in the controls panel: which property the files
 * are sorted by, which way, and what type that property is read as — the three things the sort
 * dropdown, the direction arrow and the types modal used to be visited for separately.
 *
 * A UI over the sort rather than a sort of its own: every press goes through applySortAndRender, the
 * choke point the column menu shares, and nothing here stores anything.
 */

import { appState } from '../../services/store.js';
import { setPropertyType } from '../../services/property-type.js';
import { savePropertyTypes } from '../../table-layouts/layout-file.js';
import { renderSortList } from '../ui-functions-render/render-sort-list.js';
import { applySortAndRender } from './sort-object.js';
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
 * Reverses the sort, by the pressed row's property — so on a row that is not the sort yet it both
 * chooses that row and turns the direction round, which is what the button said it would show.
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
 * Records a row's type once the type dialog closes, and re-sorts when it is the property the files
 * are sorted by, since the type is what the sort compares by. The list is repainted either way:
 * the type names the row's direction button.
 * @param {HTMLElement} row
 * @returns {void}
 */
function commitSortType(row) {
    const property = row.dataset.property;
    setPropertyType(property, row.dataset.type, row.dataset.searchType);
    savePropertyTypes();

    if (property === appState.sortState.property) applySortAndRender(property, appState.sortState.direction);
    listElement().innerHTML = renderSortList();
}
