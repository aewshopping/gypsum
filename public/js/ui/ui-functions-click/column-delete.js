// Removing a column from the saved layout, for the two places that offer it.

import { appState, TABLE_VIEW_COLUMNS } from '../../services/store.js';
import { saveLayout } from '../../table-layouts/layout-file.js';
import { playLayoutSaved } from '../ui-functions-table/render-table-controls.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { showWarningModal } from './warning-modal.js';

/**
 * Drops a column from the active layout for good, once the user has agreed to it.
 *
 * **It writes to disk straight away**, unlike everything else that touches a layout. The point of
 * removing a column is to be rid of it in the saved layout, so leaving that to a later "save layout"
 * would be leaving the job half done — and both callers offer it as a finished action rather than as
 * one more pending change.
 *
 * **Only ever a column nothing fills in.** Both callers ask that first, and each in its own way: the
 * picker offers a bin only on a row it drew as dead, the header menu only on a cell it drew with
 * data-empty. Neither is checked again here, because a second answer to "is this column empty" is a
 * second thing to keep in step — and because this only ever touches the layout. No file is opened,
 * so no note can lose anything by it.
 *
 * Here rather than in either caller so the two cannot drift apart: the picker holds its other changes
 * until the dialog closes and the menu has nothing to hold, but what removing a column *means* is the
 * same in both, and it is this.
 *
 * @param {string} property - The column's property name.
 * @returns {Promise<boolean>} Whether it was removed — false if the user cancelled.
 */
export async function deleteColumnFromLayout(property) {
    const active = appState.tableLayouts.active;

    const confirmed = await showWarningModal(
        `Remove the "${property}" column from the '${active}' layout? ` +
        `The loaded folder has no values for this property.`,
        'remove column', 'cancel');
    if (!confirmed) return false;

    TABLE_VIEW_COLUMNS.columnLayout.delete(property);
    await saveLayout(active);
    playLayoutSaved();

    renderFiles();
    return true;
}
