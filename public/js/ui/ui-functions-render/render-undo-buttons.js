import { appState } from '../../services/store.js';
import { canReverse } from '../ui-functions-click/undo-cell-edit.js';
import { describeBatch } from '../../table-undo/describe-batch.js';
import { escapeHtml } from './escape-html.js';

/**
 * @file Undo, redo and the undo history: three buttons at the end of a view's control row, drawn by
 * the table's row and the flowchart's alike, since a link drawn on the chart goes on the same stack
 * as a cell edit. One view shows at a time, so the ids are unique on the page; they keep the table's
 * names, which is where the buttons began.
 *
 * **Both start disabled**, and become live only when the matching stack has something on it. The
 * state is read from appState here and moved by hand by markUndoState below, because a cell edit
 * re-renders the rows only, so a button waiting for the next full render would go live at some
 * unrelated moment.
 */

/**
 * The three buttons, lit from the stacks as they are now.
 * @returns {string} HTML string.
 */
export function renderUndoButtons() {
    return `<button type="button" id="table-undo-btn" class="svg-wrapper-style" data-action="table-undo" data-tip="${escapeHtml(undoTip('undo'))}"${canReverse('undo') ? '' : ' disabled'}>
                    <svg viewBox="0 0 45 48"><use href="#icon-undo"></use></svg>
                </button>
                <button type="button" id="table-redo-btn" class="svg-wrapper-style" data-action="table-redo" data-tip="${escapeHtml(undoTip('redo'))}"${canReverse('redo') ? '' : ' disabled'}>
                    <svg viewBox="0 0 45 48"><use href="#icon-redo"></use></svg>
                </button>
                <button type="button" id="table-undo-list-btn" class="svg-wrapper-style" data-action="undo-list" data-tip="undo history"${canOpenList() ? '' : ' disabled'}>
                    <svg viewBox="0 0 45 48"><use href="#icon-undo-history"></use></svg>
                </button>`;
}

/**
 * Lights the undo, redo and history buttons, or puts them out.
 *
 * Called after every push, pop and clear, and either side of a reversal — the write is asynchronous,
 * so a button left live during it would take a second press against bytes the first has not written.
 * A render that has not drawn the row yet simply finds nothing, which is the same no-op the layout
 * save helpers rely on — see ui/layout-save-state.js.
 * @returns {void}
 */
export function markUndoState() {
    const undo = document.getElementById('table-undo-btn');
    const redo = document.getElementById('table-redo-btn');

    if (undo) {
        undo.disabled = !canReverse('undo');
        undo.dataset.tip = undoTip('undo');
    }
    if (redo) {
        redo.disabled = !canReverse('redo');
        redo.dataset.tip = undoTip('redo');
    }

    const list = document.getElementById('table-undo-list-btn');
    if (list) list.disabled = !canOpenList();
}

/**
 * The history button is lit whenever the undo stack holds anything, including when undo itself is
 * dark after a view change: that pairing is how the table says "nothing from this visit, but there
 * is history". plans/completed/table-delete-column.md §17.2. It stays lit while refused undos are
 * kept, with nothing left to undo, because "clear undo history" is the one way to be rid of them.
 * @returns {boolean}
 */
function canOpenList() {
    return (appState.undoStack.length > 0 || appState.undoRefusals.length > 0) && !appState.bulkWriteInFlight;
}

/** The fallback tooltips, for a stack with nothing on it — a disabled button shows none anyway. */
const IDLE_TIPS = { undo: 'undo last cell edit | Ctrl+Z', redo: 'redo cell edit | Ctrl+Y' };
const SHORTCUTS = { undo: 'Ctrl+Z', redo: 'Ctrl+Y' };

/**
 * What pressing undo or redo will do, named after the batch on top of its stack — so the tooltip
 * says `undo people column delete in 35 files | Ctrl+Z` rather than only that something will be
 * undone. plans/completed/table-delete-column.md §7.2.
 *
 * Plain text: the renderer escapes it into its attribute, since a property name comes from a note.
 *
 * @param {'undo'|'redo'} direction
 * @returns {string}
 */
function undoTip(direction) {
    const stack = direction === 'undo' ? appState.undoStack : appState.redoStack;
    const top = stack.at(-1);
    return top
        ? `${direction} ${describeBatch(top)} | ${SHORTCUTS[direction]}`
        : IDLE_TIPS[direction];
}
