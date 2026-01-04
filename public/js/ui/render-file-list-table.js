import { renderTableHeader } from './ui-functions-table/render-table-header.js';
import { renderTableRows } from './ui-functions-table/render-table-rows.js';
import { tableColumns } from './ui-functions-table/render-table-columns-helper.js';
import { initialScrollSync } from './ui-functions-table/table-scrollbar-sync.js';
import { FILE_PROPERTIES, TABLE_VIEW_COLUMNS } from '../services/store.js';

/**
 * Orchestrates the rendering of the table view.
 * It clears the output, generates the table container,
 * and then calls the header and row rendering functions.
 */
export async function renderFileList_table() {

    const columnsToShow = tableColumns();

    // Create a detailed properties array for the current columns
    TABLE_VIEW_COLUMNS.current_props = columnsToShow.map(propName => ({
        name: propName,
        ...FILE_PROPERTIES[propName]
    }));

    // Generate the dynamic header
    const headerHtml = renderTableHeader(TABLE_VIEW_COLUMNS.current_props);

    // Generate the dynamic rows
    const rowsHtml = renderTableRows(TABLE_VIEW_COLUMNS.current_props);

    // Combine header and rows within the main table container
    const tableHtml = `
    <div class="table-wrapper">
        <div id="top-scrollbar-container">
        <div id="top-scrollbar-content"></div>
        </div>
        <div class="list-table">
            ${headerHtml}
            ${rowsHtml}
        </div>
    </div>
    `;

    // Set the final HTML to the output element
    document.getElementById('output').innerHTML = tableHtml;

    // sync up the top horizontal scroll bar
    initialScrollSync();

}

// for sort operation where we want to keep the header row so we don't lose horizontal scroll place
export function renderTableRowsOnly() {

    const rowElementsToDelete = document.querySelectorAll(".note-table");

    for (const element of rowElementsToDelete) {
        element.remove();
    }

    const rowsHtml = renderTableRows(TABLE_VIEW_COLUMNS.current_props);

    const headerElement = document.querySelector(".note-table-header");
    headerElement.insertAdjacentHTML('afterend', rowsHtml);

}
