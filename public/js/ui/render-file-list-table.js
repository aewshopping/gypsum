import { renderTableHeader } from './ui-functions-table/render-table-header.js';
import { renderTableRows } from './ui-functions-table/render-table-rows.js';
import { resolveColumns } from './ui-functions-table/render-table-columns-helper.js';
import { initialScrollSync } from './ui-functions-table/table-scrollbar-sync.js';
import { applyColumnWidths } from './ui-functions-table/apply-column-widths.js';
import { reparkColumnResizer } from './ui-functions-table/table-col-resize.js';
import { renderTableControls } from './ui-functions-table/render-table-controls.js';
import { TABLE_VIEW_COLUMNS } from '../services/store.js';
import { closeColumnMenu } from './ui-functions-click/column-menu.js';

/**
 * Orchestrates the rendering of the table view.
 * It clears the output, generates the table container,
 * and then calls the header and row rendering functions.
 * @param {boolean} renderEverything - A flag to render all files or only the filtered ones.
 * @param {boolean} [fullRender=true] - A flag to indicate whether to perform a full render (including headers) or just update rows.
 */
export function renderFileList_table(renderEverything, fullRender = true) {

    // resolveColumns returns every candidate column; the table renders the shown ones. The
    // picker renders the same list unfiltered, which is what keeps the two in agreement.
    TABLE_VIEW_COLUMNS.current_props = resolveColumns().filter(column => column.visible);

    // Every render replaces the rows, and a full one replaces the scroll container
    // itself, so the horizontal scroll position has to be carried across. Reading it here
    // covers every caller — filtering, pagination, sorting — rather than each of them
    // having to remember. There is no scroller yet on the first render of the view.
    const scrollLeft = document.querySelector('.list-table')?.scrollLeft ?? 0;

    // Covers both paths below: a full render rebuilds the header from defaults, and a
    // partial one leaves --grid-columns alone, so any dragged width has to be re-applied.
    // After the scrollLeft read, not before: changing the tracks resizes the scroller, and
    // a narrower one clamps its own scrollLeft — which is the value being carried across.
    applyColumnWidths(TABLE_VIEW_COLUMNS.current_props);

    if (fullRender) {
        // Where we want to generate full table including headers and scroll bar

        // The header cell the menu anchors to is about to be replaced, which would leave
        // an open menu attached to nothing.
        closeColumnMenu();

        // Generate the dynamic header
        const headerHtml = renderTableHeader(TABLE_VIEW_COLUMNS.current_props);

        // Generate the dynamic rows
        const rowsHtml = renderTableRows(TABLE_VIEW_COLUMNS.current_props, renderEverything);

        // The scrollbar and header sit in .table-chrome, ABOVE the scroll container,
        // so they can stick to the viewport. Only the rows live inside .list-table.
        // The control row sits above the chrome and outside it, so it scrolls away rather
        // than holding viewport height for the length of the list.
        const tableHtml = `
        <div class="table-wrapper">${renderTableControls()}
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

    // A full render replaced the header cell the resize bar was parked over. Nothing but a
    // press-and-release dismisses the bar, so it moves to the same column's new cell. Also
    // called from renderFiles, which catches the renders that never reach this function —
    // but only once a view transition has finished, so the bar would visibly lag without this.
    reparkColumnResizer();
}