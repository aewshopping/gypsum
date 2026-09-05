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

    // Every render replaces the rows, and a full one replaces the scroll container
    // itself, so the horizontal scroll position has to be carried across. Reading it here
    // covers every caller — filtering, pagination, sorting — rather than each of them
    // having to remember. There is no scroller yet on the first render of the view.
    const scrollLeft = document.querySelector('.list-table')?.scrollLeft ?? 0;

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
        // for sort operations, where only the rows need replacing

        document.querySelector(".list-table").innerHTML =
            renderTableRows(TABLE_VIEW_COLUMNS.current_props, renderEverything);
    }

    // Restored after initialScrollSync, whose read of scrollWidth settles layout first —
    // assigning to a scroller the browser has not laid out yet would clamp to 0. The
    // header follows on its own, being driven by the scroll position rather than by JS.
    document.querySelector(".list-table").scrollLeft = scrollLeft;
}