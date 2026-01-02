import { appState, TABLE_VIEW_COLUMNS } from '../../services/store.js';

export function tableColumns() {

    // Dynamically determine columns to show from myFilesProperties
    // Include all file properties as columns except those that are listed in "hidden_always" and "hidden_at_start"

    const hiddenColumns = new Set([...TABLE_VIEW_COLUMNS.hidden_always, ...TABLE_VIEW_COLUMNS.hidden_at_start]);
    const columnsToShow = [...appState.myFilesProperties.keys()].filter(prop => !hiddenColumns.has(prop));

    return columnsToShow;

}