// Open, close and change for the flowchart options modal: which property fills each part of the
// chart.

import { renderFlowchartOptionsList, renderFlowchartLayoutRows, flowchartOptionsNote } from './flowchart-options-list.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { setFlowchartOption } from '../../services/flowchart/flowchart-options.js';
import { saveFlowchartOptions, saveFlowchartLayout } from '../../table-layouts/layout-file.js';
import { setFlowchartLayoutSetting } from '../../services/flowchart/flowchart-layout-settings.js';

const dialog = document.getElementById('modal-flowchart-options');

/**
 * Opens the options modal, built fresh from the loaded folder.
 *
 * Built on open rather than at startup, as the column picker and the sort modal are: the options
 * are the properties of whichever folder is loaded, and one of them may be a property only the
 * saved choices still remember.
 * @returns {void}
 */
export function handleOpenFlowchartOptions() {
    document.getElementById('flowchart-options-note').textContent = flowchartOptionsNote();
    document.getElementById('flowchart-options-list').innerHTML = renderFlowchartOptionsList() + renderFlowchartLayoutRows();
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
 * Records a layout setting — direction, or merging — and writes it, as a role's choice is: at once,
 * with the redraw left to the dialog's close.
 *
 * @param {Event} evt - The change event.
 * @param {HTMLElement} target - The select that changed.
 * @returns {void}
 */
export function handleFlowchartLayoutChange(evt, target) {
    setFlowchartLayoutSetting(target.dataset.setting, target.value);
    saveFlowchartLayout();
}

/**
 * Finishes with the dialog, however it was closed — the close button, Escape and clicking outside
 * all reach it, which is what closedby="any" buys.
 *
 * Nothing is written here; a choice reaches the disk when it is made. The re-render is for what a
 * choice changes on screen, which is the whole chart.
 *
 * The list is emptied afterwards, the same reason the picker empties its own —
 * nothing in the app holds rendered state between renders, and a row left over from a previous
 * folder would look exactly like a real one.
 * @returns {void}
 */
export function handleFlowchartOptionsClose() {
    document.getElementById('flowchart-options-list').innerHTML = '';
    renderFiles();
}
