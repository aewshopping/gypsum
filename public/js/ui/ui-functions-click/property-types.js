// Open and close for the types modal: which type each of the user's own properties is read as.

import { renderPropertyTypesList, userTypeProperties } from '../ui-functions-table/property-types-list.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';

const dialog = document.getElementById('modal-property-types');

const NOTE_SOME = 'types are used when sorting, searching, and when showing values in table view';
const NOTE_NONE = "your files don't have any user properties, feel free to add some in frontmatter YAML format :-)";

/**
 * Opens the types modal, built fresh from the loaded folder.
 *
 * The note says what the list is for, or — when there is no list — what to do about it, which is
 * the whole of an empty dialog's job. Two sentences rather than one plus a hidden row, so an empty
 * folder gets an answer rather than a blank.
 * @returns {void}
 */
export function handleOpenPropertyTypes() {
    document.getElementById('property-types-note').textContent =
        userTypeProperties().length ? NOTE_SOME : NOTE_NONE;
    document.getElementById('property-types-list').innerHTML = renderPropertyTypesList();
    dialog.showModal();
}

/**
 * @returns {void}
 */
export function handleClosePropertyTypes() {
    dialog.close();
}

/**
 * Finishes with the dialog, however it was closed — the close button, Escape and clicking outside
 * all reach it, which is what closedby="any" buys.
 *
 * Nothing is written here. A type reaches the disk the moment it is set, from the type dialog's own
 * commit, so there is no state waiting on this close the way the column picker's layout is. The
 * re-render is for what a type changes on screen: how a cell is drawn, and what the table sorts by.
 *
 * The list is emptied afterwards, the same reason the picker empties its own — nothing in the app
 * holds rendered state between renders, and a row left over from a previous folder would look
 * exactly like a real one.
 * @returns {void}
 */
export function handlePropertyTypesClose() {
    document.getElementById('property-types-list').innerHTML = '';
    renderFiles();
}
