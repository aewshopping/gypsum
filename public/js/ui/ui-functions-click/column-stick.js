/**
 * @file "stick columns to here" and "unstick columns" in the column menu.
 *
 * What sticks is a count of leading columns, not a list of names, so it follows the arrangement:
 * sticking to the third column sticks whatever three columns are first, and moving another column
 * to the front later sticks that one instead. Part of the layout, so it marks the layout unsaved
 * the way hiding a column does, and reaches disk when the layout is saved.
 */

import { TABLE_VIEW_COLUMNS } from '../../services/store.js';
import { closeColumnMenu, clearHeaderSelection } from './column-menu.js';
import { markLayoutDirty } from '../layout-save-state.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';

/**
 * Sets how many leading columns stick, and redraws.
 * @param {number} count
 * @returns {void}
 */
function setStickyCount(count) {
    TABLE_VIEW_COLUMNS.stickyCount = count;
    closeColumnMenu();
    clearHeaderSelection();
    markLayoutDirty();
    renderFiles();
}

/**
 * Sticks every column from the first up to and including the menu's own.
 * @returns {void}
 */
export function handleColumnStick() {
    const property = document.getElementById('column-menu')?.dataset.property;
    const position = TABLE_VIEW_COLUMNS.current_props.findIndex(prop => prop.name === property);
    if (position === -1) return;

    setStickyCount(position + 1);
}

/**
 * @returns {void}
 */
export function handleColumnUnstick() {
    setStickyCount(0);
}
