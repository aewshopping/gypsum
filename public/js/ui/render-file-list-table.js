import { renderTableHeader } from './ui-functions-table/render-table-header.js';
import { renderTableRows } from './ui-functions-table/render-table-rows.js';
import { tableColumns } from './ui-functions-table/render-table-columns-helper.js';
import { initialScrollSync } from './ui-functions-table/table-scrollbar-sync.js';
import { FILE_PROPERTIES, TABLE_VIEW_COLUMNS } from '../services/store.js';

/**
 * Orchestrates the rendering of the table view.
 * It clears the output, generates the table container,
 * and then calls the header and row rendering functions.
 * @param {boolean} renderEverything - A flag to render all files or only the filtered ones.
 * @param {boolean} [fullRender=true] - A flag to indicate whether to perform a full render (including headers) or just update rows.
 */
export function renderFileList_table(renderEverything, fullRender = true) {

    TABLE_VIEW_COLUMNS.current_props.length = 0;
    const columnsToShow = tableColumns();

    // Create a detailed properties array for the current columns
    TABLE_VIEW_COLUMNS.current_props = columnsToShow.map(propName => ({
        name: propName,
        ...FILE_PROPERTIES.get(propName)
    }));

    if (fullRender) {
        // Where we want to generate full table including headers and scroll bar

        // Generate the dynamic header
        const headerHtml = renderTableHeader(TABLE_VIEW_COLUMNS.current_props);

        // Generate the dynamic rows
        const rowsHtml = renderTableRows(TABLE_VIEW_COLUMNS.current_props, renderEverything);

        // The scrollbar and header sit in .table-chrome, ABOVE the scroll container,
        // so they can stick to the viewport. Only the rows live inside .list-table.
        const tableHtml = `
        <div class="table-wrapper">
            <div class="table-chrome">
                <div id="top-scrollbar-container">
                <div id="top-scrollbar-content"></div>
                </div>
                ${headerHtml}
            </div>
            <div class="list-table">
                ${rowsHtml}
            </div>
        </div>
        `;

        // Set the final HTML to the output element
        document.getElementById('output').innerHTML = tableHtml;

        // sync up the top horizontal scroll bar
        initialScrollSync();

    } else {
        // for sort or filter operations, where replacing only the rows keeps the
        // horizontal scroll position (rewriting innerHTML resets scrollLeft to 0)

        const scroller = document.querySelector(".list-table");
        const scrollLeft = scroller.scrollLeft;

        scroller.innerHTML = renderTableRows(TABLE_VIEW_COLUMNS.current_props, renderEverything);

        scroller.scrollLeft = scrollLeft;

    }
}