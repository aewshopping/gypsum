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
 * The width a column should render at. The layout is the whole answer: resolveColumns() seeds
 * every entry with the schema's width when it first sees the property, so there is no second
 * fallback to consult here. The remaining ?? covers a column drawn before it has been seeded,
 * which nothing reaches — but undefined in a grid track is worse than a default.
 *
 * Read from the layout rather than from the passed column, because a resize drag writes the
 * layout and re-applies the widths without re-rendering — the column objects are from the last
 * render and would carry a stale width for the length of the drag.
 * @param {object} prop - A resolved column from TABLE_VIEW_COLUMNS.current_props.
 * @returns {number} Width in px.
 */
export function columnWidthPx(prop) {
    return TABLE_VIEW_COLUMNS.columnLayout.get(prop.name)?.width ?? DEFAULT_COLUMN_WIDTH;
}

/**
 * Writes the current column widths into --grid-columns.
 *
 * One column can be given a track of its own instead of its px width, which is how auto-size
 * asks the browser to measure it: an intrinsic track sizes to the content, and the width it
 * lands on can then be read back off the cells.
 * @param {Array<object>} current_props - The columns being rendered, in order.
 * @param {string} [overrideName] - The column to give a different track to.
 * @param {string} [overrideTrack] - That track, e.g. 'max-content'.
 * @returns {void}
 */
export function applyColumnWidths(current_props, overrideName = null, overrideTrack = null) {
    const tracks = current_props
        .map(prop => prop.name === overrideName ? overrideTrack : `${columnWidthPx(prop)}px`)
        .join(' ');
    document.body.style.setProperty('--grid-columns', tracks);

    // Where each sticky column comes to rest: the widths of the sticky columns before it. The
    // sticky columns are the leading ones, so that is also where each sits unscrolled, which is
    // what lets the header's cells follow with a single counter-scroll rather than an offset each.
    // Written here for the reason --grid-columns is — a resize drag reflows without re-rendering.
    let left = 0;
    for (let i = 0; i < stickyColumnCount(current_props); i++) {
        document.body.style.setProperty(`--sticky-left-${i}`, `${left}px`);
        left += columnWidthPx(current_props[i]);
    }
    document.body.style.setProperty('--sticky-width', `${left}px`);
}

/**
 * How many of the shown columns stick left: the layout's count, cut to the columns there are.
 * @param {Array<object>} current_props - The columns being rendered, in order.
 * @returns {number}
 */
export function stickyColumnCount(current_props) {
    return Math.min(TABLE_VIEW_COLUMNS.stickyCount, current_props.length);
}
