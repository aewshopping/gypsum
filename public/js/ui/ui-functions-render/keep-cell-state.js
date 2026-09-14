// The class cell-expand.js marks a selected cell with. Repeated here rather than imported, because
// importing it would close a cycle: a cell's commit reaches the renderer through the save path.
const SELECTED = 'is-selected';

/**
 * @file Focus and selection, carried across a re-render.
 *
 * A render replaces the rows, and the browser drops focus to the body when the focused node goes —
 * so the cell you were just in stops being the cell the arrow keys move from, and stops being one
 * click from opening again. Nothing else puts that back.
 *
 * **Carried here rather than by each caller**, the same arrangement the table's horizontal scroll
 * position already has and for the same reason: filtering, sorting, paging and saving would each
 * have to remember, and the one that forgot would be the bug.
 */

/**
 * Where a cell is, in terms that survive the render: its row's id and its column.
 *
 * Addressed this way rather than by data-index, which is a position in the page and shifts whenever
 * the rows do. A card has a row id and no column. Anything outside the file list has no address at
 * all — a save must not drag focus out of the searchbox and into the table.
 *
 * @param {Element|null} element
 * @returns {{vtId: string, prop: string|null}|null}
 */
function addressOf(element) {
    const row = element?.closest?.('#output [data-vt-id]');
    if (!row) return null;

    return { vtId: row.dataset.vtId, prop: element.closest('[data-prop]')?.dataset.prop ?? null };
}

/**
 * The element an address points at now, or null if the render did not draw it — a note the filters
 * now exclude, or one on a page you are no longer looking at.
 *
 * @param {{vtId: string, prop: string|null}|null} address
 * @returns {Element|null}
 */
function elementAt(address) {
    if (!address) return null;

    const row = document.querySelector(`#output [data-vt-id="${CSS.escape(address.vtId)}"]`);
    if (!row || !address.prop) return row;

    return row.querySelector(`[data-prop="${CSS.escape(address.prop)}"]`);
}

/**
 * What has focus and what is selected, before a render takes them away.
 * @returns {{focused: object|null, selected: object|null}}
 */
export function captureCellState() {
    return {
        focused: addressOf(document.activeElement),
        selected: addressOf(document.querySelector(`.note-table-cell.${SELECTED}`)),
    };
}

/**
 * Puts both back on the elements the render has just drawn.
 * @param {{focused: object|null, selected: object|null}} state - From captureCellState.
 * @returns {void}
 */
export function restoreCellState(state) {
    elementAt(state.selected)?.classList.add(SELECTED);
    elementAt(state.focused)?.focus();
}
