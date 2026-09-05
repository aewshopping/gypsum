/**
 * @file Expands a single table cell to show its full content.
 *
 * Click once to select a cell, again to expand it, again to collapse. The two steps
 * exist because cells contain their own clickable things — tag pills, the open button,
 * internal links — and a single click would have to compete with them.
 *
 * Only the clicked cell grows, and only downward: it is taken out of flow, so the row
 * keeps its height and every column keeps its width.
 */

const SELECTED = 'is-selected';
const EXPANDED = 'is-expanded';
const FLIPPED = 'flip-up';

/**
 * Returns a cell to its collapsed, unselected state.
 * @param {HTMLElement} cell
 * @returns {void}
 */
function collapse(cell) {
    cell.classList.remove(SELECTED, EXPANDED, FLIPPED);
    for (const sibling of cell.parentElement.children) {
        sibling.style.gridColumn = '';
    }
}

/**
 * Collapses whichever cell is currently selected or expanded.
 * @returns {void}
 */
export function clearExpandedCells() {
    document.querySelectorAll(`.note-table-cell.${SELECTED}, .note-table-cell.${EXPANDED}`)
        .forEach(collapse);
}

/**
 * Lifts a cell out of flow so it can grow past its row.
 * @param {HTMLElement} cell
 * @returns {void}
 */
function expand(cell) {
    // Pin every cell in the row to its own column. Two things go wrong otherwise, both
    // because the expanded cell is about to leave the flow: the cells after it slide
    // left into the gap it leaves, and it stops being bounded by its own column. Both
    // lines are needed: for an out-of-flow grid item an auto end line means the edge of
    // the grid, not one track, so a start line alone would let it span to the last column.
    [...cell.parentElement.children].forEach((sibling, i) => {
        sibling.style.gridColumn = `${i + 1} / ${i + 2}`;
    });

    cell.classList.add(EXPANDED);

    // Growing downward out of the last rows would extend the table's scrollable area
    // and raise a vertical scrollbar, so anchor to the cell's bottom edge instead.
    const table = cell.closest('.list-table');
    if (cell.getBoundingClientRect().bottom > table.getBoundingClientRect().bottom) {
        cell.classList.add(FLIPPED);
    }
}

/**
 * Click handler for a table cell: selects it, expands it, or collapses it again.
 * @param {MouseEvent} evt
 * @param {HTMLElement} cell - The cell carrying data-action="expand-cell".
 * @returns {void}
 */
export function handleCellExpand(evt, cell) {
    // select -> expand -> back to select. Clicking a different cell starts the cycle
    // there, so only one cell is ever open.
    const shouldExpand = cell.classList.contains(SELECTED);

    clearExpandedCells();

    if (shouldExpand) {
        expand(cell);
    } else {
        cell.classList.add(SELECTED);
    }
}

/**
 * Collapses the open cell when a click lands anywhere outside the table's cells.
 * Called for every click, alongside the delegated action handlers.
 * @param {MouseEvent} evt
 * @returns {void}
 */
export function handleCellExpandClickOutside(evt) {
    if (!evt.target.closest('.note-table-cell')) {
        clearExpandedCells();
    }
}
