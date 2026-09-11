import { sortAppStateFiles } from '../../services/file-object-sort.js';
import { appState } from '../../services/store.js';
import { propertyType } from '../../services/property-type.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { syncSortControls } from '../ui-elements-load/sort-select-load.js';
import { markSortedColumn } from '../ui-functions-table/render-table-header.js';

/**
 * Sorts files by the given property and direction, re-renders, updates sort state, and
 * brings the sort controls with it. The single choke point every sort path shares — the
 * column menu, the sort dropdown and the direction toggle all arrive here.
 * @param {string} sortProp - The file property key to sort by.
 * @param {string} sortDirection - 'asc' or 'desc'.
 * @returns {void}
 */
export function applySortAndRender(sortProp, sortDirection) {
    sortAppStateFiles(sortProp, propertyType(sortProp), sortDirection);
    renderFiles(false);
    Object.assign(appState.sortState, { property: sortProp, direction: sortDirection });
    syncSortControls();
    markSortedColumn();
}
