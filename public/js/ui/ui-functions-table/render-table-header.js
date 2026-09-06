import { appState } from '../../services/store.js';

/**
 * Renders the header strip for the table view.
 * Dynamically creates column headers based on specified properties.
 *
 * The header is NOT a child of .list-table. It sits above the scroll container so it
 * can stick to the viewport: a sticky element resolves against its nearest scroll
 * container, so a header inside .list-table would stick to the table rather than the
 * page. It re-declares the same --grid-columns tracks instead of using subgrid, and is
 * kept horizontally in step with the body by note-table.css (see --table-h-scroll).
 *
 * The header cell itself is the column-menu trigger: one click selects it, a second opens
 * the menu. The chevron is no longer a control — it marks the column driving the sort, and
 * CSS shows it only on the cell carrying data-sorted.
 *
 * @param {Array<object>} current_props - The properties to render as column headers.
 * @returns {string} The HTML string for the table header strip.
 */
export function renderTableHeader(current_props) {

    // Generate the header cell HTML
    const headerCellsHtml = current_props
        .map(prop => {
            const sorted = prop.name === appState.sortState.property
                ? ` data-sorted="${appState.sortState.direction}"`
                : '';
            return `<div class="note-table-cell-header flex-row" data-property="${prop.name}" data-action="column-menu-open" data-tip="column options"${sorted}>${prop.name}<span class="flexgrow"> </span><div class="column-sort-indicator">˅</div></div>`;
        })
        .join('');

    // The strip clips the header horizontally; the header itself is full track width.
    return `<div class="note-table-header-strip"><div class="note-table-header">${headerCellsHtml}</div></div>`;
}

/**
 * Moves the data-sorted marker onto the column currently driving the sort, so CSS can show
 * that column's chevron and hide the rest.
 *
 * Sorting re-renders with fullRender = false, which replaces only the rows — the header
 * markup above runs on a full render, so the marker has to be moved by hand in between.
 * @returns {void}
 */
export function markSortedColumn() {
    for (const cell of document.querySelectorAll('.note-table-cell-header')) {
        if (cell.dataset.property === appState.sortState.property) {
            cell.dataset.sorted = appState.sortState.direction;
        } else {
            delete cell.dataset.sorted;
        }
    }
}
