import { openEditor, closeEditor, cancelEdit } from './cell-editor.js';
import { releaseRowMove } from '../ui-functions-table/pending-row-move.js';

/**
 * @file Which cell is selected, which is open, and what opens one.
 *
 * **Selection follows focus.** The selected cell is the cell focus is in, and nothing else decides
 * it: the arrow keys, Tab, a click and a restored render all move focus, and the mark goes with it.
 * That is why Tab needs no handling at all — it moves focus, and the rest follows — and why a cell
 * focus has left lets go of the mark and of whatever was typed into it, which is written on the way
 * out.
 *
 * Click once to select a cell, again to open it. The two steps exist because cells contain their own
 * clickable things — tag pills, the open button, internal links — and a single click would have to
 * compete with them. The first press is the one that brings focus to the cell, which is how the two
 * are told apart now that the click itself no longer does the selecting.
 *
 * Only the opened cell grows, and only downward: it is taken out of flow, so the row keeps its
 * height and every column keeps its width.
 *
 * **What an open cell offers is cell-editor.js's question, not this file's.** Selecting, expanding
 * and collapsing is the whole job here; it asks what to open and does it.
 */

const SELECTED = 'is-selected';
const EXPANDED = 'is-expanded';

/**
 * Returns a cell to its collapsed, unselected state.
 * @param {HTMLElement} cell
 * @returns {void}
 */
function collapse(cell) {
    cell.classList.remove(SELECTED, EXPANDED);
    closeEditor(cell);
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
 * Focus has arrived somewhere: that cell is the selected one now, and every other lets go.
 *
 * The whole of "selection follows focus", and it is why Tab is left alone — the browser moves focus
 * and the rest follows, whether the key was Tab, an arrow, or none at all. Focus arriving outside
 * the table marks nothing and still lets the old cell go, which is what closes an open cell when you
 * Tab or click out of it: collapsing is what writes the edit.
 *
 * **On arrival rather than on the way out**, which is not a detail: a focusout handler that touches
 * the DOM — and closing an editor means removing its contenteditable — makes Chrome abandon the
 * focus move that was in flight, so Tab out of an open cell landed on the body instead of the next
 * cell. By focusin the move is done and the old cell can be taken apart safely.
 *
 * Focus moving *within* a cell is not leaving it: a date cell's picker button and its input are both
 * in there, and the cell they belong to is the one this finds.
 *
 * **And a row held back from its move is let go here**, after the cell that was left has been
 * collapsed — because collapsing is what writes the edit, and a move made before the write would be
 * sorting on a value the file does not have yet. Not the only door: focus can leave a row without
 * arriving anywhere, which is why a click asks the same question — see pending-row-move.js.
 *
 * @param {FocusEvent} evt
 * @returns {void}
 */
export function handleCellFocusIn(evt) {
    const cell = evt.target.closest?.('.note-table-cell');

    for (const other of document.querySelectorAll(`.note-table-cell.${SELECTED}, .note-table-cell.${EXPANDED}`)) {
        if (other !== cell) collapse(other);
    }

    cell?.classList.add(SELECTED);

    releaseRowMove();
}

// Whether the press landed on a cell the keyboard was already on. Read before the press moves focus,
// because that is the only moment the answer still exists: by the time the click arrives, the first
// press of the cycle has focused the cell and looks exactly like the second.
let pressedFocusedCell = false;

/**
 * Records what the press is about to change, before it changes it.
 * @param {PointerEvent} evt
 * @returns {void}
 */
export function handleCellPointerDown(evt) {
    const cell = evt.target.closest?.('.note-table-cell');
    pressedFocusedCell = Boolean(cell?.contains(document.activeElement));
}

/**
 * Whether the press that led to this click landed on a cell that was already selected.
 *
 * **The same answer the cell itself opens on, asked by the links inside it.** A cell's content is
 * live on the second press, not the first, which is the rule this file exists to keep — and a
 * [[link]] in a front matter cell has to obey it or there is no way left to edit that cell. A cell
 * holding one link is the link, end to end: a first press that followed it would put the note on
 * screen every time someone meant to correct a typo, with no part of the cell left to aim at.
 *
 * Exported rather than re-derived in internal-link-click.js because the answer stops existing once
 * the press has moved focus — by the time the click arrives, the first press of the cycle looks
 * exactly like the second.
 *
 * @returns {boolean}
 */
export function pressWasOnSelectedCell() {
    return pressedFocusedCell;
}

/**
 * Finishes with the cell that is open, leaving it selected and focused.
 *
 * **That is the state one click puts a cell in**, which is what makes the way out match the way in:
 * one more click or Enter reopens it, and the arrow keys move from it, because a closed cell is
 * focusable and takes no caret. Without it the commit's re-render drops focus onto the body and the
 * arrow keys do nothing until something is clicked.
 *
 * @param {boolean} [discard=false] - Put the cell back to the text it opened with first, so nothing
 *   is written. Escape's answer; Enter, and clicking another cell, commit.
 * @returns {boolean} False when no cell was open, which is the caller's cue that Escape has nothing
 *   to step back from here.
 */
export function finishOpenCell(discard = false) {
    const cell = document.querySelector(`.note-table-cell.${EXPANDED}`);
    if (!cell) return false;

    if (discard) cancelEdit(cell);
    collapse(cell);
    cell.classList.add(SELECTED);
    cell.focus();
    return true;
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
    openEditor(cell);
}

/**
 * Click handler for a table cell: opens it, or leaves the press to have done the selecting.
 *
 * **Nothing here selects anything.** The press that lands on an unselected cell focuses it, and
 * focus is what marks it — so the first click of the cycle has already done its work by the time
 * this runs, and this is only ever asked whether to open.
 *
 * @param {MouseEvent} evt
 * @param {HTMLElement} cell - The cell carrying data-action="expand-cell".
 * @returns {void}
 */
export function handleCellExpand(evt, cell) {
    // Clicks inside an already-open cell belong to the caret, not to us. Escape, Tab, or a click
    // elsewhere closes it.
    if (cell.classList.contains(EXPANDED)) return;

    // A click the app made itself carries no press — detail is 0 — and only Enter, Space and F2
    // make one, each of them on the cell that already has focus.
    if (evt.detail === 0 || pressedFocusedCell) expand(cell);
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
