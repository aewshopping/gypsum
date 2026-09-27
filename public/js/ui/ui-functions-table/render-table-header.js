import { appState } from '../../services/store.js';
import { typeGlyph } from '../ui-functions-render/type-glyph.js';
import { HEADER_TIP_IDLE } from '../ui-functions-click/column-menu.js';
import { stickyColumnCount } from './apply-column-widths.js';

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
 * The type glyph is the same drawing the column picker puts on its rows, so a column says what it
 * is in both places. Its locked tooltip is about the type and nothing else — it used to say "not
 * editable from the table", which stopped being true of every locked column when `title` gained a
 * caret while keeping its padlock. "set by the app" is the wording the picker already uses for the
 * same fact. It sits hard against the right edge on every column, with the sort chevron
 * inside it — the glyph is on every header and the chevron on one, so the glyph is the mark that
 * lines up down the table and the chevron is the one that moves. Here it is a mark rather than a control: the cell is already a button, and a
 * button may not contain another one. "change type" in the column menu is how it is set from here.
 *
 * The cell carries the type and search type as data attributes for the same reason a picker row
 * does — it is what the type menu reads and writes when it is opened over this column.
 *
 * data-empty says no file in the folder has a value for this column, which note-table.css draws as
 * a faded heading: the layout asked for the column, so it stays, and the fade is what stops it
 * reading like a column whose rows merely happen to be blank. data-keyless is the narrower fact
 * that no file has the key at all — a column of bare `people:` keys is empty but not keyless. The
 * column menu reads data-keyless back off the cell rather than working it out again, so "remove
 * from layout" and "delete column" follow what the header was drawn from.
 *
 * @param {Array<object>} current_props - The properties to render as column headers.
 * @returns {string} The HTML string for the table header strip.
 */
export function renderTableHeader(current_props) {

    const stickyCount = stickyColumnCount(current_props);

    // Generate the header cell HTML
    const headerCellsHtml = current_props
        .map((prop, column) => {
            // No left offset, unlike a sticky body cell: the header is not scrolled but moved, so
            // a sticky heading is moved back by the same amount — see note-table-sticky.css.
            const sticky = column < stickyCount
                ? ` is-sticky${column === stickyCount - 1 ? ' is-sticky-last' : ''}`
                : '';
            const sorted = prop.name === appState.sortState.property
                ? ` data-sorted="${appState.sortState.direction}"`
                : '';
            return `<button type="button" class="note-table-cell-header flex-row${sticky}" data-property="${prop.name}" data-action="column-menu-open" data-tip="${HEADER_TIP_IDLE}" data-type="${prop.type}" data-search-type="${prop.search_type}"${sorted}${prop.blank ? ' data-empty' : ''}${prop.dead ? ' data-keyless' : ''}>` +
                     `<span class="header-label flexgrow">${prop.label ?? prop.name}</span>` +
                     `<span class="column-sort-indicator">➜</span>` +
                     typeGlyph(prop, 'header-type-glyph', 'set by the app') +
                   `</button>`;
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
