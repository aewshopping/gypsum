import { appState } from '../../services/store.js';
import { INFO_TYPE } from '../../constants.js';
import { isInfoColumn, isPropertyEditable } from '../../services/property-type.js';
import { HEADER_TIP_IDLE } from '../ui-functions-click/column-menu.js';

/**
 * How far each type's drawing moves up and left on a locked column, freeing the bottom-right corner
 * for the padlock.
 *
 * A number per type because each drawing fills its box differently — the calendar and the list reach
 * the bottom right, the T and the i do not. Chosen by eye against the plain glyphs, magnified and at
 * the size the header draws them.
 *
 * **A new type needs an entry here** as well as its `#icon-type-<name>` symbol.
 */
const LOCK_SHIFT = {
    string: '-6 -4',
    number: '-7 -5',
    date:   '-6 -7',
    array:  '-6 -7',
    info:   '-6 -4',
};

/**
 * The glyph a column wears, which answers two questions in one mark.
 *
 * **Which drawing**: the column's own type, unless the app fills the column in, in which case the
 * info glyph says so — the type underneath is unchanged and still drives sorting and rendering.
 *
 * **Whether it is locked**: a column whose cells take no caret wears the same drawing moved up and
 * left, with the padlock laid over the corner that frees. Composed here from the two symbols rather
 * than drawn as a combined symbol per type, so the padlock exists once and a type's shape once.
 *
 * **One element either way**, which is the point of a badge rather than a second glyph: a padlock
 * beside the type glyph made the header carry a heading and three marks, and `lastModified` had to
 * widen 20px to hold them. The type drawing is never scaled, so the mark measures the same on a
 * locked column as on an open one.
 *
 * The locked question is the one cell-editor.js asks before giving a caret, so the mark and the
 * behaviour cannot drift apart. Its `data-tip` wins over the header button's while the pointer is on
 * the glyph, because tooltip.js resolves with closest('[data-tip]').
 *
 * @param {object} column - The column, carrying `name` and `type`.
 * @returns {string} The HTML for the glyph.
 */
function glyphFor(column) {
    const glyph = isInfoColumn(column.name) ? INFO_TYPE.value : column.type;

    if (isPropertyEditable(column.name)) {
        return `<svg class="type-glyph header-type-glyph" viewBox="0 0 50 50" aria-hidden="true">` +
                 `<use href="#icon-type-${glyph}"></use></svg>`;
    }

    return `<svg class="type-glyph header-type-glyph" viewBox="0 0 50 50" aria-hidden="true"` +
           ` data-tip="not editable from the table">` +
             `<use href="#icon-type-${glyph}" transform="translate(${LOCK_SHIFT[glyph]})"></use>` +
             `<use href="#icon-lock-badge"></use></svg>`;
}

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
 * is in both places. It sits hard against the right edge on every column, with the sort chevron
 * inside it — the glyph is on every header and the chevron on one, so the glyph is the mark that
 * lines up down the table and the chevron is the one that moves. Here it is a mark rather than a control: the cell is already a button, and a
 * button may not contain another one. "change type" in the column menu is how it is set from here.
 *
 * The cell carries the type and search type as data attributes for the same reason a picker row
 * does — it is what the type menu reads and writes when it is opened over this column.
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
            return `<button type="button" class="note-table-cell-header flex-row" data-property="${prop.name}" data-action="column-menu-open" data-tip="${HEADER_TIP_IDLE}" data-type="${prop.type}" data-search-type="${prop.search_type}"${sorted}>` +
                     `<span class="header-label flexgrow">${prop.label ?? prop.name}</span>` +
                     `<span class="column-sort-indicator">➜</span>` +
                     glyphFor(prop) +
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
