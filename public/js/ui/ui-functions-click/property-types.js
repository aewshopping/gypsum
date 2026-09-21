// Open and close for the types modal: which type each of the user's own properties is read as.

import { renderPropertyTypesList } from '../ui-functions-table/property-types-list.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { setPropertyType } from '../../services/property-type.js';
import { savePropertyTypes } from '../../table-layouts/layout-file.js';
import { showWarningModal } from './warning-modal.js';

const dialog = document.getElementById('modal-property-types');

const NOTE_SOME = 'types are used when sorting, searching, and when showing values in table view';
const NOTE_NONE = "your files don't have any user properties, feel free to add some in frontmatter YAML format :-)";

/**
 * Fills the dialog from the loaded folder: the rows, and the note above them.
 *
 * The note says what the list is for, or — when there is no list — what to do about it, which is
 * the whole of an empty dialog's job. Two sentences rather than one plus a hidden row, so an empty
 * folder gets an answer rather than a blank.
 *
 * It reads the note off the rendered rows rather than asking the property list a second time,
 * because that question costs a pass over every loaded file. Shared with the bin below so that
 * forgetting the last abandoned type leaves the dialog explaining itself rather than saying what
 * types are for above nothing — the same job column-picker.js's paintList does.
 * @returns {void}
 */
function paintList() {
    const rows = renderPropertyTypesList();
    document.getElementById('property-types-note').textContent = rows ? NOTE_SOME : NOTE_NONE;
    document.getElementById('property-types-list').innerHTML = rows;
}

/**
 * Opens the types modal, built fresh from the loaded folder.
 * @returns {void}
 */
export function handleOpenPropertyTypes() {
    paintList();
    dialog.showModal();
}

/**
 * @returns {void}
 */
export function handleClosePropertyTypes() {
    dialog.close();
}

/**
 * Forgets the type saved for a property the loaded folder no longer has.
 *
 * **Nothing else could reach it.** A type is not part of a layout, so deleting the column it used to
 * be drawn as leaves it untouched — and "delete column" is not even offered unless a layout is
 * saved. Without this the entry sat in table_layouts.gypsum for ever, read back on every load and
 * written out on every save, with nothing on screen to say it was there.
 *
 * **setPropertyType with no type is the forget path**, so this writes through the same one writer
 * every other type change goes through rather than reaching into the Map itself. The save is
 * fire-and-forget through the file's own queue, as everywhere else: a type reaches the disk the
 * moment it is set, and so does its removal.
 *
 * **It asks first**, unlike setting a type, which needs no confirmation anywhere. Not because
 * anything is at risk — no note is touched and the property has no values left — but because this is
 * the same press as the column picker's bin, and a bin that asks in one dialog and not in the other
 * would be the inconsistency worth avoiding.
 *
 * The repaint takes the row away, so focus goes back to the dialog the way the picker's bin does.
 * No render of the files: the table is behind an open dialog, and closing this one redraws it.
 *
 * @async
 * @param {Event} evt - The click event.
 * @param {HTMLElement} target - The bin that was pressed.
 * @returns {Promise<void>}
 */
export async function handlePropertyTypeDelete(evt, target) {
    const property = target.dataset.property;

    const confirmed = await showWarningModal(
        `Forget the type saved for "${property}"? The loaded folder has no values for this property.`,
        'forget type', 'cancel');
    if (!confirmed) return;

    setPropertyType(property);
    savePropertyTypes();

    paintList();
    dialog.focus();
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
