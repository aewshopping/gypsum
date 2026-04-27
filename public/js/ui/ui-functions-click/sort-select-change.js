import { applySortAndRender } from './sort-object.js';
import { appState } from '../../services/store.js';

/**
 * Handles the change event for the sort property dropdown.
 * Reads the current direction from the sort-direction checkbox and applies the sort.
 * @param {Event} evt - The change event.
 * @param {HTMLSelectElement} selectElement - The sort property dropdown.
 * @returns {void}
 */
export function handleSortSelectChange(evt, selectElement) {
    const sortProp = selectElement.value;
    const checkbox = document.querySelector('[data-action="sort-direction-toggle"]');
    const sortDirection = checkbox.checked ? 'asc' : 'desc';
    applySortAndRender(sortProp, sortDirection);
}

/**
 * Handles the change event for the sort direction checkbox.
 * Checked means ascending; unchecked means descending.
 * @param {Event} evt - The change event.
 * @param {HTMLInputElement} checkboxElement - The sort direction checkbox.
 * @returns {void}
 */
export function handleSortDirectionChange(evt, checkboxElement) {
    const sortProp = appState.sortState.property;
    const sortDirection = checkboxElement.checked ? 'asc' : 'desc';
    applySortAndRender(sortProp, sortDirection);
}
