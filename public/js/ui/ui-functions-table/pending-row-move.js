/**
 * @file A row whose place in the sort order has changed, held where it is until you have finished
 * with it.
 *
 * Every cell edit moves the file's last modified time, which is what the table sorts by until
 * someone says otherwise — so a written row usually belongs somewhere else, and re-sorting at once
 * takes the row out from under the cell you are still in. Held instead: the row is outlined to say a
 * move is coming, and it makes the move the moment focus leaves it, which is the moment nobody is
 * looking at that row any more.
 *
 * The outline is the only thing that says "not where this belongs" — without it the table is simply
 * wrong until you click away, which is worse than either answer.
 */

import { appState } from '../../services/store.js';
import { propertyType } from '../../services/property-type.js';
import { fileComparator, sortAppStateFiles } from '../../services/file-object-sort.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { clearCopiedCells } from '../ui-functions-cell/cell-range-copy.js';

/** The class the row wears while its move is waiting. Drawn by table row CSS in note-table.css. */
const PENDING = 'move-pending';

/**
 * Says rows have been written to, and holds their move if sorting would now put any elsewhere.
 *
 * **Asked after the write's own render**, because that render is what draws the rows this marks —
 * and because the files have to have been re-read before the question can be answered at all.
 *
 * A sort that would leave a row where it is holds nothing for it: editing a note while the table is
 * sorted by title moves nothing, and an outline there would be promising a move that never comes.
 * The test is the sorted position against the current one, on a copy, so asking does not reorder
 * anything.
 *
 * **And the hold is only while focus is in a written row.** Leaving a cell by clicking the searchbox
 * is a write and a departure in one gesture, and the write lands after the departure — so by the
 * time this is asked, nobody is in the rows and there is nothing to protect. They move at once
 * instead, which is what the click asked for.
 *
 * **Any written row, not only the outlined ones**: a paste writes many rows and only some may need to
 * move, and arrowing from one pasted row to the next is still looking at what was pasted. A hold
 * already waiting is added to rather than replaced, or its rows would wait for a sort nobody makes.
 * See plans/completed/table-range-paste.md §3.3.
 *
 * @param {Iterable<string>} internalIds - The files whose rows were written.
 * @returns {void}
 */
export function holdRowMove(internalIds) {
    const written = new Set([...(appState.pendingRowMove?.written ?? []), ...internalIds]);
    const { property, direction } = appState.sortState;
    const sorted = [...appState.myFiles].sort(fileComparator(property, propertyType(property), direction));
    const at = (files, id) => files.findIndex(file => file.internalId === id);
    const moving = new Set([...written].filter(id => at(sorted, id) !== at(appState.myFiles, id)));

    if (moving.size === 0) return;

    if (focusIsIn(written)) {
        appState.pendingRowMove = { written, moving };
        // One dashed mark at a time: the copy outline gives way to the move. The clipboard keeps
        // the copy — emptying it needs a press, and this comes after an asynchronous write.
        clearCopiedCells();
        for (const id of moving) rowFor(id)?.classList.add(PENDING);
        return;
    }

    moveRows();
}

/**
 * Lets a held move happen, unless focus is still inside a row holding it.
 *
 * **The question is where focus is now, not where it has just arrived.** Asking about an arrival
 * answers nothing when focus arrives nowhere: clicking a part of the page that cannot take focus
 * blurs the cell to the body and fires no focusin at all, so a row went on waiting until the next
 * click landed on something focusable. `document.activeElement` is the same answer `:focus-within`
 * would give, and it is available however focus left.
 *
 * Asked from two doors, which between them cover every way of leaving: the focusin handler that
 * already decides which cell is selected, and a click anywhere on the page. Both are arrivals —
 * focusout is deliberately not used, because a handler that redraws the list on the way out makes
 * the browser abandon the focus move in flight, which is the same trap cell-expand.js avoids.
 *
 * @returns {void}
 */
export function releaseRowMove() {
    const held = appState.pendingRowMove;
    if (held === null) return;
    if (focusIsIn(held.written)) return;

    for (const id of held.moving) rowFor(id)?.classList.remove(PENDING);
    moveRows();
}

/**
 * @param {Set<string>} internalIds
 * @returns {boolean} Whether focus is inside one of these files' rows.
 */
function focusIsIn(internalIds) {
    const row = document.activeElement?.closest?.('#output .note-table[data-vt-id]');
    return Boolean(row) && internalIds.has(row.dataset.vtId);
}

/**
 * Puts the file list back in sort order and redraws it.
 *
 * sortAppStateFiles is what clears the held row, since every sort settles where every row goes —
 * this one, an undo's, or a column sorted by hand.
 *
 * @returns {void}
 */
function moveRows() {
    const { property, direction } = appState.sortState;
    sortAppStateFiles(property, propertyType(property), direction);
    // The page is kept: a move is not a reason to send someone who is working on page three back
    // to page one.
    renderFiles(false, true);
}

/**
 * The row on screen for a file, or null when this render did not draw it.
 * @param {string} internalId
 * @returns {Element|null}
 */
function rowFor(internalId) {
    return document.querySelector(`#output .note-table[data-vt-id="${CSS.escape(internalId)}"]`);
}
