import { appState } from './store.js';

/*
 * Sorts the globalData array (appState.myFiles) based on a specified property and data type.
 *
 * @param {string} property - The property name within the objects to sort by (e.g., 'name', 'score').
 * @param {('string'|'number'|'date'|'array')} dataType - The data type of the property's value.
 * @param {('asc'|'desc')} [sortOrder='asc'] - The direction to sort: 'asc' (ascending, default) or 'desc' (descending).
 * @returns {void} The function sorts the globalData array in place.
 */
export function sortAppStateFiles(property, dataType, sortOrder = 'asc') {
    let dataArray = appState.myFiles;

    if (!dataArray || !Array.isArray(dataArray)) {
        console.error("Error: appState.myFiles is not defined or is not an array.");
        return;
    }

    const orderMultiplier = (sortOrder === 'desc' ? -1 : 1);

    dataArray.sort((a, b) => {
        const valA = a[property];
        const valB = b[property];
        let comparison = 0;

        switch (dataType) {
            case 'string':
                comparison = (valA || '').localeCompare(valB || '');
                break;
            case 'number':
                comparison = (valA || 0) - (valB || 0);
                break;
            case 'date':
                comparison = new Date(valA) - new Date(valB);
                break;
            case 'array':
                comparison = (valA?.length || 0) - (valB?.length || 0);
                break;
        }

        return comparison * orderMultiplier;
    });
}