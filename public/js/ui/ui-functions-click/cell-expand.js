/**
 * @file Expands a single table cell to show its full content.
 *
 * Click once to select a cell, again to expand it, again to collapse. The two steps
 * exist because cells contain their own clickable things — tag pills, the open button,
 * internal links — and a single click would have to compete with them.
 *
 * Only the clicked cell grows, and only downward: it is taken out of flow, so the row
 * keeps its height and every column keeps its width.
 *
 * An expanded cell is editable, so its text can be corrected in place. Nothing is saved
 * yet — edits live in the DOM and are discarded by the next render.
 *
 * **A cell the app fills in is not editable either**, and says nothing about it: the info glyph on
 * its column header already does. It still opens, so a long path or a long error stays readable.
 *
 * **A cell whose value does not fit its column is not editable at all.** It opens like any other,
 * so the whole value can be read, but it takes no caret: editing a value the column cannot describe
 * risks writing back the wrong shape, and the fix is either to change the column's type or to open
 * the note. It says which, in the cell, because the tooltip carrying the same sentence needs a
 * pointer and half the people using this have a finger.
 */

const SELECTED = 'is-selected';
const EXPANDED = 'is-expanded';
const NOTE = 'cell-mismatch-note';

/**
 * Returns a cell to its collapsed, unselected state.
 * @param {HTMLElement} cell
 * @returns {void}
 */
function collapse(cell) {
    cell.classList.remove(SELECTED, EXPANDED);
    cell.removeAttribute('contenteditable');
    cell.querySelector(`.${NOTE}`)?.remove();
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

    // A mismatched cell opens but does not take a caret. The sentence is the one already on the
    // cell's tooltip, so the pointer and the touch paths cannot say different things.
    if (cell.dataset.mismatch) {
        cell.insertAdjacentHTML('beforeend', `<span class="${NOTE}">${cell.dataset.tip}</span>`);
        cell.focus();
        return;
    }

    // So does a cell in a column the app fills in — but silently. A mismatch explains itself
    // because something is wrong and there is something to do about it; this is working exactly as
    // intended, and a sentence on every size cell would be noise. The header's info glyph says it.
    if (cell.dataset.info !== undefined) {
        cell.focus();
        return;
    }

    // plaintext-only keeps pasted markup out of a cell that ultimately stands for text
    // in a file. Focusing puts the caret in without a further click.
    cell.setAttribute('contenteditable', 'plaintext-only');
    cell.focus();
}

/**
 * Click handler for a table cell: selects it, expands it, or collapses it again.
 * @param {MouseEvent} evt
 * @param {HTMLElement} cell - The cell carrying data-action="expand-cell".
 * @returns {void}
 */
export function handleCellExpand(evt, cell) {
    // Clicks inside an already-expanded cell belong to the caret, not to us. Escape or a
    // click outside closes it.
    if (cell.classList.contains(EXPANDED)) return;

    // select -> expand. Clicking a different cell starts the cycle there, so only one
    // cell is ever open.
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
