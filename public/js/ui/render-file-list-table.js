import { renderTableHeader } from './ui-functions-table/render-table-header.js';
import { renderTableRows } from './ui-functions-table/render-table-rows.js';

/**
 * Orchestrates the rendering of the table view.
 * It clears the output, generates the table container,
 * and then calls the header and row rendering functions.
 */
export async function renderFileList_table() {
    // Generate the dynamic header
    const headerHtml = renderTableHeader();

    // Generate the dynamic rows
    const rowsHtml = renderTableRows();

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