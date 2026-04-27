import { sortAppStateFiles } from '../../services/file-object-sort.js';
import { appState, FILE_PROPERTIES, propertySortMap } from '../../services/store.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';

/**
 * Sorts files by the given property and direction, re-renders, and updates sort state.
 * Shared by both the table header click handler and the sort-select controls.
 * @param {string} sortProp - The file property key to sort by.
 * @param {string} sortDirection - 'asc' or 'desc'.
 * @returns {void}
 */
export function applySortAndRender(sortProp, sortDirection) {
    const sortType = FILE_PROPERTIES.get(sortProp)?.type ?? 'string';
    sortAppStateFiles(sortProp, sortType, sortDirection);
    renderFiles(false);
    Object.assign(appState.sortState, { property: sortProp, direction: sortDirection });
    propertySortMap.set(sortProp, appState.sortState);
}

/**
 * Handles the click event to sort the file list by a specific property.
 * Toggles direction if the property was previously sorted; otherwise defaults to 'asc'.
 * @param {Event} evt - The click event.
 * @param {HTMLElement} element - The element that triggered the sort, which must have a `data-property` attribute.
 * @returns {void}
 */
export function handleSortObject(evt, element) {
    const sortProp = element.dataset.property;
    const previousSort = propertySortMap.get(appState.sortState.property);
    const sortDirection = (!previousSort || previousSort.direction === 'desc') ? 'asc' : 'desc';
    applySortAndRender(sortProp, sortDirection);
}

