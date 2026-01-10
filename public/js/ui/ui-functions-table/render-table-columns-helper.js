import { appState, TABLE_VIEW_COLUMNS, FILE_PROPERTIES } from '../../services/store.js';

/**
 * Determines and returns the list of table columns to be displayed.
 * It filters out columns that are configured to be always hidden or hidden at the start,
 * and then sorts the remaining columns based on their predefined display order.
 * @returns {string[]} An array of property names representing the columns to show.
 */
export function tableColumns() {

    // Dynamically determine columns to show from myFilesProperties
    // Include all file properties as columns except those that are listed in "hidden_always" and "hidden_at_start"

    const hiddenColumns = new Set([...TABLE_VIEW_COLUMNS.hidden_always, ...TABLE_VIEW_COLUMNS.hidden_at_start]);
    const columnsToShow = [...appState.myFilesProperties.keys()].filter(prop => !hiddenColumns.has(prop));

    // Sort columns based on the display_order defined in FILE_PROPERTIES
    columnsToShow.sort((a, b) => {
        const orderA = FILE_PROPERTIES[a]?.display_order ?? 99;
        const orderB = FILE_PROPERTIES[b]?.display_order ?? 99;
        return orderA - orderB;
    });

    return columnsToShow;

}