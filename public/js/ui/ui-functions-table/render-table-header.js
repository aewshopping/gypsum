import { appState } from '../../services/store.js';
import { HEADER_TIP_IDLE } from '../ui-functions-click/column-menu.js';

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
 * It is a <button> so that the keyboard reaches it for free: it is in the tab order, and Enter
 * or Space fires a click, which is the same event the delegated data-action handler already
 * answers. Nothing keyboard-specific is written anywhere. That also forces the chevron to be a
 * span — a button may only contain phrasing content, so a div inside one is invalid.
 *
 * Headed by the property's label where FILE_PROPERTIES gives it one, so contentPeek reads as
 * "preview" here and in the column picker alike — a row in the picker and its column in the table
 * should not be named differently. data-property keeps the raw name: the column menu, the sort,
 * the hover highlight and the resize bar all key on it.
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
            return `<button type="button" class="note-table-cell-header flex-row" data-property="${prop.name}" data-action="column-menu-open" data-tip="${HEADER_TIP_IDLE}"${sorted}>${prop.label ?? prop.name}<span class="flexgrow"> </span><span class="column-sort-indicator">➜</span></button>`;
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
