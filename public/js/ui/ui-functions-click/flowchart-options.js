// Open, close and change for the flowchart options modal: which property fills each part of the
// chart.

import { renderFlowchartOptionsList, flowchartOptionsNote } from '../ui-functions-flowchart/flowchart-options-list.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { setFlowchartOption } from '../../services/flowchart-options.js';
import { saveFlowchartOptions } from '../../table-layouts/layout-file.js';

const dialog = document.getElementById('modal-flowchart-options');

/**
 * Opens the options modal, built fresh from the loaded folder.
 *
 * Built on open rather than at startup, as the column picker and the types modal are: the options
 * are the properties of whichever folder is loaded, and one of them may be a property only the
 * saved choices still remember.
 * @returns {void}
 */
export function handleOpenFlowchartOptions() {
    document.getElementById('flowchart-options-note').textContent = flowchartOptionsNote();
    document.getElementById('flowchart-options-list').innerHTML = renderFlowchartOptionsList();
    dialog.showModal();
}

/**
 * @returns {void}
 */
export function handleCloseFlowchartOptions() {
    dialog.close();
}

/**
 * Records a choice and writes it, the moment it is made.
 *
 * **It reaches the disk at once**, the way setting a column type does and for the same reason: this
 * is not part of a layout, so there is no "save" for the user to forget and no dirty mark to carry.
 * Fire-and-forget through the layouts file's own queue, which is what keeps five quick changes from
 * interleaving into truncated JSON.
 *
 * No confirmation anywhere. Nothing here writes a note — a wrongly-pointed role makes an
 * odd-looking chart, which the next change puts right.
 *
 * No re-render either: the chart is behind an open dialog, and closing it redraws.
 *
 * @param {Event} evt - The change event.
 * @param {HTMLElement} target - The select that changed.
 * @returns {void}
 */
export function handleFlowchartOptionChange(evt, target) {
    setFlowchartOption(target.dataset.role, target.value);
    saveFlowchartOptions();
}

/**
 * Finishes with the dialog, however it was closed — the close button, Escape and clicking outside
 * all reach it, which is what closedby="any" buys.
 *
 * Nothing is written here; a choice reaches the disk when it is made. The re-render is for what a
 * choice changes on screen, which is the whole chart.
 *
 * The list is emptied afterwards, the same reason the picker and the types modal empty theirs —
 * nothing in the app holds rendered state between renders, and a row left over from a previous
 * folder would look exactly like a real one.
 * @returns {void}
 */
export function handleFlowchartOptionsClose() {
    document.getElementById('flowchart-options-list').innerHTML = '';
    renderFiles();
}
