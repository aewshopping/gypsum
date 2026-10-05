import { appState } from '../../services/store.js';
import { DEFAULT_LAYOUT_LABEL } from '../ui-functions-render/render-layout-list.js';
import { renderUndoButtons } from '../ui-functions-render/render-undo-buttons.js';

/**
 * Renders the table's control row: the layout in use, the column picker, and undo, redo and the
 * undo history at the far end.
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
 * **Undo and redo simply follow the layout controls**, with no spacer between. The row is one run
 * of controls at the right-hand end of the controls panel's second line. Their glyphs are the content
 * modal's own undo and redo, reached from the shared sprite so that one drawing serves both
 * places — see plans/completed/table-undo-stack.md §10.1.
 *
 * The three buttons are render-undo-buttons.js, shared with the flowchart's row, whose links are on
 * the same stack.
 *
 * **What an undo did is not said here.** It is said in #output-report, which belongs to every view
 * rather than to the table — see ui-functions-render/output-report.js. Inside the row it would jump
 * the row's height as it appeared and wrap the buttons rather than itself at phone width.
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

    // Paste before copy: copy can show without paste (while cells are copied), never the reverse, so
    // the hidden one's kept space falls at the row's outer end rather than between copy and the rest.
    return `
            <div class="output-controls">
                <button type="button" id="range-paste-btn" class="svg-wrapper-style" data-action="range-paste" data-tip="paste into the selected cells (Ctrl+V)">
                    <svg viewBox="0 0 50 50"><use href="#icon-paste"></use></svg>
                </button>
                <button type="button" id="range-copy-btn" class="svg-wrapper-style" data-action="range-copy-menu" data-tip="copy the selected cells (Ctrl+C)"${appState.copiedCells ? ' data-copied' : ''}>
                    <svg viewBox="0 0 50 50"><use class="copy-mark" href="#icon-copy"></use><use class="copied-badge" href="#icon-clear-badge"></use></svg>
                </button>
                <button type="button" id="layout-name" class="btn-menu" data-action="open-layouts-modal" data-tip="switch, save and edit table layouts">${active ?? DEFAULT_LAYOUT_LABEL}</button>
                <button type="button" class="svg-wrapper-style" data-action="open-column-picker" data-tip="show and hide columns">
                    <svg viewBox="0 0 50 50"><use href="#icon-columns"></use></svg>
                </button>
                ${renderUndoButtons()}
            </div>`;
}
