/**
 * @file Resolves table column widths and writes them to the DOM.
 *
 * Every column width in the table comes from one custom property: .list-table and
 * .note-table-header both declare grid-template-columns: var(--grid-columns), and the rows
 * are subgrid. So changing that one value reflows the header and every row together, with
 * no DOM writes and no re-render — which is what makes the resize drag cheap.
 *
 * The renderer and the resize drag both come through here, so there is only ever one path
 * from a width to the screen.
 */

import { DEFAULT_COLUMN_WIDTH } from '../../constants.js';
import { TABLE_VIEW_COLUMNS } from '../../services/store.js';

/**
 * The width a column should render at: a dragged override first, then the schema default,
 * then the fallback. Nullish rather than truthy, so a stored 0 is not read as absent.
 * @param {object} prop - A resolved column from TABLE_VIEW_COLUMNS.current_props.
 * @returns {number} Width in px.
 */
export function columnWidthPx(prop) {
    return TABLE_VIEW_COLUMNS.widthOverrides.get(prop.name)
        ?? prop.column_width
        ?? DEFAULT_COLUMN_WIDTH;
}

/**
 * Writes the current column widths into --grid-columns.
 * @param {Array<object>} current_props - The columns being rendered, in order.
 * @returns {void}
 */
export function applyColumnWidths(current_props) {
    const tracks = current_props.map(prop => `${columnWidthPx(prop)}px`).join(' ');
    document.body.style.setProperty('--grid-columns', tracks);
}
