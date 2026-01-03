import { renderTableHeader } from './ui-functions-table/render-table-header.js';
import { renderTableRows } from './ui-functions-table/render-table-rows.js';
import { tableColumns } from './ui-functions-table/render-table-columns-helper.js';

/**
 * Orchestrates the rendering of the table view.
 * It clears the output, generates the table container,
 * and then calls the header and row rendering functions.
 */
export async function renderFileList_table() {

    const columnsToShow = tableColumns();

    // Generate the dynamic header
    const headerHtml = renderTableHeader(columnsToShow);

    // Generate the dynamic rows
    const rowsHtml = renderTableRows(columnsToShow);

    // Combine header and rows within the main table container
    const tableHtml = `
        <div class="list-table">
            ${headerHtml}
            ${rowsHtml}
        </div>
    `;

    // Set the final HTML to the output element
    document.getElementById('output').innerHTML = tableHtml;
}

// for sort operation where we want to keep the header row so we don't lose horizontal scroll place
export function renderTableRowsOnly() {

    const rowElementsToDelete = document.querySelectorAll(".note-table");

    for (const element of rowElementsToDelete) {
        element.remove();
    }

    const columnsToShow = tableColumns();
    const rowsHtml = renderTableRows(columnsToShow);

    const headerElement = document.querySelector(".note-table-header");
    headerElement.insertAdjacentHTML('afterend', rowsHtml);

}
