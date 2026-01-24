import { appState, TABLE_VIEW_COLUMNS, FILE_PROPERTIES } from '../../services/store.js';

/**
 * Determines which columns to show in the table view.
 *
 * @returns {Array<string>} An array of property names to show as columns.
 */
export function tableColumns() {

    // Dynamically determine columns to show from myFilesProperties
    // Include all file properties as columns except those that are listed in "hidden_always" and "hidden_at_start"

    const hiddenColumns = new Set([...TABLE_VIEW_COLUMNS.hidden_always, ...TABLE_VIEW_COLUMNS.hidden_at_start]);
    const columnsToShow = [...appState.myFilesProperties.keys()].filter(prop => !hiddenColumns.has(prop));

    // Sort columns based on the display_order defined in FILE_PROPERTIES
    columnsToShow.sort((a, b) => {
        const orderA = FILE_PROPERTIES.get(a)?.display_order ?? 99;
        const orderB = FILE_PROPERTIES.get(b)?.display_order ?? 99;
        return orderA - orderB;
    });

    return columnsToShow;

}