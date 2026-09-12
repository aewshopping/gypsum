/**
 * @file "auto-size column" from the column options menu: sets a column to the width its
 * widest content actually needs.
 *
 * The browser does the measuring. Every column width comes from one custom property,
 * --grid-columns, so handing the target column an intrinsic track and reading back what the
 * cells end up at is enough — no font metrics, no cloned measuring node, no per-cell loop.
 *
 * The track is max-content, and the cap is applied afterwards in JS. Asking for
 * fit-content(1000px) and letting the browser cap the track looks tidier but measures the
 * wrong thing: a fit-content track is also clamped to the space left over in the container,
 * so it reports what fits on screen rather than what the content needs. max-content has no
 * such clamp, and nothing is painted at the uncapped width — both writes below happen in one
 * synchronous handler.
 *
 * Two reads, because .list-table and .note-table-header are separate grids that each size
 * their own copy of the track: the header cell gives the label plus its sort chevron, and any
 * body cell gives the widest cell in the column (subgrid rows contribute to .list-table's
 * tracks). The larger of the two is the width that clips nothing.
 *
 * A list column is the exception, and is measured by its widest item instead — see widestItemPx.
 *
 * What it cannot see: only the current page of rows is in the DOM, so that is what gets
 * measured. Paging to a row with longer content can leave it clipped until auto-size is run
 * again — accepted, in exchange for a measurement that costs one layout.
 */

import { MIN_COLUMN_WIDTH, MAX_AUTO_COLUMN_WIDTH } from '../../constants.js';
import { TABLE_VIEW_COLUMNS } from '../../services/store.js';
import { closeColumnMenu, clearHeaderSelection } from '../ui-functions-click/column-menu.js';
import { applyColumnWidths } from './apply-column-widths.js';
import { syncScrollbarThumb } from './table-scrollbar-sync.js';
import { reparkColumnResizer } from './table-col-resize.js';
import { markLayoutDirty } from './render-table-controls.js';
import { itemRangesIn } from '../ui-functions-highlight/list-highlight.js';

/**
 * What a list column needs: the width of its widest **item**, not of its whole line.
 *
 * A list cell is one comma-joined line, so its max-content is every item in the busiest row added
 * together — a quantity with no natural bound. Five names measured 414px against a 250px widest item,
 * and a note with a dozen tags simply runs into the 1000px cap, which made the button useless on the
 * columns whose width is hardest to judge by hand.
 *
 * An item is the unit a list is read in, so fitting the widest one is the promise a clipped one-line
 * cell can actually keep: whatever the first item of a row is, you can read all of it. The rest is
 * what opening the cell is for.
 *
 * The ranges are the ones list-highlight.js marks the items with. Measuring them needs no track
 * change: a cell is nowrap and overflow: hidden, so a narrow column clips the painting and not the
 * layout, and an item reports its true width whatever the column is set to.
 *
 * @param {string} property - The column to measure.
 * @returns {number} Width in px including the cell's padding and border, or 0 if the column holds no
 *                   list cells — a tags column renders pills, and a mismatched cell renders raw text.
 */
function widestItemPx(property) {
    const cells = document.querySelectorAll(
        `.list-table .note-table-cell[data-list][data-prop="${CSS.escape(property)}"]`);
    if (!cells.length) return 0;

    let widest = 0;
    for (const cell of cells) {
        for (const range of itemRangesIn(cell)) {
            widest = Math.max(widest, range.getBoundingClientRect().width);
        }
    }
    if (!widest) return 0;

    const style = getComputedStyle(cells[0]);
    const chrome = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
                 + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
    return widest + chrome;
}

/**
 * Measures what a column needs, leaving the tracks as it found them.
 *
 * The two applyColumnWidths calls are one synchronous pair, so the intrinsic track is never
 * painted — getBoundingClientRect flushes layout for the read, and the second call puts the
 * px tracks back before the frame ends.
 * @param {string} property - The column to measure.
 * @returns {number} Width in px, clamped to [MIN_COLUMN_WIDTH, MAX_AUTO_COLUMN_WIDTH]; 0 if
 *                   the column is not rendered.
 */
function naturalWidthPx(property) {
    const header = document.querySelector(`.note-table-cell-header[data-property="${CSS.escape(property)}"]`);
    if (!header) return 0;

    const cell = document.querySelector(`.list-table .note-table-cell[data-prop="${CSS.escape(property)}"]`);

    // Measured before the track changes, because it does not depend on them — and doing it here
    // keeps the write/read pair below the tight thing it has to be.
    const items = widestItemPx(property);

    applyColumnWidths(TABLE_VIEW_COLUMNS.current_props, property, 'max-content');
    const natural = Math.max(header.getBoundingClientRect().width,
                             items || (cell?.getBoundingClientRect().width ?? 0));
    applyColumnWidths(TABLE_VIEW_COLUMNS.current_props);

    // The floor matters for an empty column, whose max-content is bare padding and border.
    return Math.min(MAX_AUTO_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.ceil(natural)));
}

/**
 * Fits the menu's column to its content. The width goes into the same override map a drag
 * writes to, so a later drag starts from here and a re-render keeps it.
 *
 * The property has to be read before closing, since closeColumnMenu clears it. Same shape as
 * the sort, search and resize items next to it in the menu.
 * @returns {void}
 */
export function handleColumnAutoSize() {
    const property = document.getElementById('column-menu')?.dataset.property;
    if (!property) return;

    closeColumnMenu();
    clearHeaderSelection();

    const width = naturalWidthPx(property);
    if (!width) return;

    TABLE_VIEW_COLUMNS.columnLayout.get(property).width = width;
    markLayoutDirty();
    applyColumnWidths(TABLE_VIEW_COLUMNS.current_props);

    syncScrollbarThumb();   // the table is a different width now
    reparkColumnResizer();  // and the bar, if it is up, is on a moved edge
}
