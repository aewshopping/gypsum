import { appState, FILE_PROPERTIES, TABLE_VIEW_COLUMNS } from '../../services/store.js';

/**
 * Seeds the sort-select with the default sort property before any files are loaded,
 * and sets the direction checkbox to match the default sort direction.
 * @returns {void}
 */
export function initSortSelect() {
    const sortSelectElem = document.querySelector('[data-action="sort-select"]');
    const defaultSortProp = appState.sortState.property;
    const defaultOption = document.createElement('option');
    defaultOption.value = defaultSortProp;
    defaultOption.textContent = FILE_PROPERTIES.get(defaultSortProp)?.label ?? defaultSortProp;
    sortSelectElem.appendChild(defaultOption);
    sortSelectElem.value = defaultSortProp;

    const directionCheckbox = document.querySelector('[data-action="sort-direction-toggle"]');
    directionCheckbox.checked = appState.sortState.direction === 'asc';
}

/**
 * Populates the sort-select dropdown with the properties found in the loaded files,
 * ordered by display_order. Properties not in FILE_PROPERTIES are placed at the end.
 * Also syncs the sort-direction checkbox to the current sort state.
 * @returns {void}
 */
export function populateSortSelect() {
    const sortSelectElem = document.querySelector('[data-action="sort-select"]');
    sortSelectElem.innerHTML = '';

    const entries = [...appState.myFilesProperties.entries()]
        .filter(([key]) => !TABLE_VIEW_COLUMNS.hidden_always.includes(key))
        .sort(([, a], [, b]) => (a.display_order ?? 99) - (b.display_order ?? 99));

    for (const [key, props] of entries) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = props.label ?? key;
        sortSelectElem.appendChild(option);
    }

    sortSelectElem.value = appState.sortState.property;

    const directionCheckbox = document.querySelector('[data-action="sort-direction-toggle"]');
    directionCheckbox.checked = appState.sortState.direction === 'asc';
}
