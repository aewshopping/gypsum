import { appState } from '../../services/store.js';
import { DEFAULT_LAYOUT_LABEL } from '../ui-functions-render/render-layout-list.js';
import { canReverse } from '../ui-functions-click/undo-cell-edit.js';

/**
 * Renders the table's control row: the layout in use, the column picker, and undo and redo at the
 * far end.
 *
 * Reading left to right it says what the table is showing and then offers to change it — the name,
 * which opens the layouts modal, and the column picker. **The name is the way in to the layouts,
 * and the only one.** It used to be a popover listing the layouts to switch between, with a
 * separate icon button beside it for the modal that lists the same layouts and can also rename,
 * delete and save them. Two doors onto one list, one of which could do less: the name now opens the
 * modal, and the picker is gone.
 *
 * **Saving a layout is in that modal too**, on the row of the layout being saved — which is what
 * says you are saving *that* layout rather than some layout, and what keeps the row that cannot be
 * saved over (the app's defaults) from offering it. The control row is left with what it is for:
 * what the table is showing, and what can be done to the table.
 *
 * **Undo and redo are pushed to the right**, past a spacer, because the controls on the left are
 * about the layout and these two are not: undo does not save, load or change the columns. Their
 * glyphs are the content modal's own undo and redo, reached from the shared sprite so that one
 * drawing serves both places — see plans/table-undo-stack.md §10.1.
 *
 * **Both start disabled**, and become live only when the matching stack has something on it. The
 * state is read from appState here and moved by hand by markUndoState below, because a cell edit
 * re-renders the rows only, so a button waiting for the next full render would go live at some
 * unrelated moment.
 *
 * **What an undo did is not said here.** It is said in #output-report, the line above the file list,
 * which belongs to every view rather than to the table — see ui-functions-render/output-report.js.
 * The row is a run of controls and that report is a sentence; inside the row it would jump the row's
 * height as it appeared and wrap the buttons rather than itself at phone width.
 *
 * The name is a button in the app's understated fill rather than a bordered one: it is a place to
 * look before it is a thing to press, and it sits next to an icon button that a border would crowd.
 *
 * The glyphs' outer viewBox starts at 0 0 rather than repeating the symbol's own 5 5 50 50: a
 * <use> is placed at the origin of the box it sits in, so a viewBox starting at 5 5 offsets the
 * glyph up and left by five units and clips it. Only the aspect ratio has to match.
 *
 * It reads appState rather than the disk, because a renderer has to stay synchronous: the list of
 * layouts is refreshed into state by layout-file.js when the folder loads and after every save,
 * rename or delete.
 *
 * @returns {string} HTML string for the control row.
 */
export function renderTableControls() {
    const { active } = appState.tableLayouts;

    return `
            <div class="output-controls">
                <button type="button" id="layout-name" class="btn-menu" data-action="open-layouts-modal" data-tip="switch, save and edit table layouts">${active ?? DEFAULT_LAYOUT_LABEL}</button>
                <button type="button" class="svg-wrapper-style" data-action="open-column-picker" data-tip="show and hide columns">
                    <svg viewBox="0 0 50 50"><use href="#icon-columns"></use></svg>
                </button>
                <div class="flexgrow"></div>
                <button type="button" id="table-undo-btn" class="svg-wrapper-style" data-action="table-undo" data-tip="undo last cell edit | Ctrl+Z"${canReverse('undo') ? '' : ' disabled'}>
                    <svg viewBox="0 0 45 48"><use href="#icon-undo"></use></svg>
                </button>
                <button type="button" id="table-redo-btn" class="svg-wrapper-style" data-action="table-redo" data-tip="redo cell edit | Ctrl+Y"${canReverse('redo') ? '' : ' disabled'}>
                    <svg viewBox="0 0 45 48"><use href="#icon-redo"></use></svg>
                </button>
            </div>`;
}

/**
 * Lights the undo and redo buttons, or puts them out.
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

    if (undo) undo.disabled = !canReverse('undo');
    if (redo) redo.disabled = !canReverse('redo');
}
