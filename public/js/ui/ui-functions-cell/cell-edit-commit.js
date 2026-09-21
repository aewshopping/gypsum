import { applyCellEdits } from '../../editing/save-cell-edit.js';
import { markUndoState } from '../ui-functions-table/render-table-controls.js';
import { holdRowMove } from '../ui-functions-table/pending-row-move.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';

/**
 * @file Someone has finished editing a cell.
 *
 * Thin on purpose: it captures, it compares, and it hands over. What may be written and how is
 * save-cell-edit.js's business; what an open cell offers is cell-editor.js's.
 */

/**
 * Writes what a cell now holds back into its note, unless it is what the cell opened with.
 *
 * **Capture is one expression for every type** — `cell.textContent` — because an editable cell
 * holds nothing but escaped text, a date cell's picker and button contribute none, and a cell
 * carrying a mismatch note never took a caret in the first place. A per-type reader would be the
 * mistake: a type needing one would mean the cell had stopped being the value. See §4.4 of
 * plans/completed/table-cell-writing.md.
 *
 * **The change test is text against text**, the cell now against the text stashed when it opened.
 * Not the captured value against the file's: rendering a value and capturing it back is not a round
 * trip — a list of numbers comes back as a list of strings, a padded item comes back trimmed — so
 * comparing values would report a change on a cell nobody touched. See §4.5 of the same plan.
 *
 * Nothing waits for the write. The table is redrawn from the file when it lands, which is the
 * existing display path; a failure past this point is the File System API's, so it is reported.
 *
 * **Closing a cell always leaves the table drawn from state**, whether or not anything was written.
 * Two ways a close reaches no file, and both have to redraw for the same reason — the screen would
 * otherwise keep saying something the file does not, and the write's own refresh only runs when a
 * file was written:
 *
 * - **the text changed but no byte did.** Clearing a title the note keeps as its `# H1` finds no
 *   `title:` key to remove, so nothing is written and the cell would sit there blank. A list
 *   retyped to the same items does it more quietly.
 * - **the cell was opened and not typed in.** Nothing to write, and for a while nothing was drawn
 *   either — but *opening* a cell takes down whatever markup its renderer put in it, so that the
 *   caret gets the plain text node it was written for (see cell-editor.js). The render after a
 *   write is what normally puts that markup back. With no write and no render, a cell holding
 *   `[[links]]` came back as dead text until something else redrew the table.
 *
 * So the redraw belongs to closing rather than to writing, and **any column whose cells draw
 * markup is covered by that without doing anything of its own** — the links today, tags if their
 * pills ever take a caret. Rows only, and the page is kept — the pair refreshFilesNow uses, and
 * the columns cannot have changed when nothing was written.
 *
 * **The undo button is lit from here**, once the write has landed and pushed its batch. It is a
 * question about the DOM, so it belongs on this side of the layer rather than in the write — and the
 * write's own re-render replaces the rows only, so nothing else would have redrawn the control row.
 *
 * **And the row's move is held here too.** The write does not re-sort for this caller: the file's
 * new last modified time usually belongs somewhere else in the order, but moving the row now takes
 * it out from under the cell that is still selected. So the row is outlined instead, and goes when
 * focus leaves it — see ui-functions-table/pending-row-move.js.
 *
 * @param {HTMLElement} cell - The cell being closed.
 * @returns {void}
 */
export function commitCellEdit(cell) {
    const opened = cell.dataset.openedText;

    // Never took a caret, so nothing was ever taken down and nothing is owed.
    if (opened === undefined) return;

    // Opened and left alone: nothing to write, and the redraw is what puts the cell's markup back.
    if (cell.textContent === opened) return renderFiles(false, true);

    const internalId = cell.closest('.note-table').dataset.vtId;

    applyCellEdits([{
        internalId,
        property: cell.dataset.prop,
        text: cell.textContent,
    }], { resort: false })
        .then(records => {
            // Neither of the two below applies to a write that did not happen: there is no undo
            // batch to light the button for, and the file's modified time has not moved, so the row
            // is not waiting to go anywhere.
            if (records.length === 0) return renderFiles(false, true);

            markUndoState();
            holdRowMove(internalId);
        })
        .catch(error => console.error('Failed to write a cell edit:', error));
}
