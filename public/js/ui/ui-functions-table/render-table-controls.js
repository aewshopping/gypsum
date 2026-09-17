import { appState } from '../../services/store.js';
import { DEFAULT_LAYOUT_LABEL } from '../ui-functions-render/render-layout-list.js';
import { spinSaveArrow, SAVE_SPIN_MS } from '../save-spin.js';
import { canReverse } from '../ui-functions-click/undo-cell-edit.js';

/**
 * Renders the table's control row: the layout in use, the three things you can do to it, and undo
 * and redo at the far end.
 *
 * Reading left to right it says what the table is showing and then offers to change it — the name,
 * which opens a list of the layouts to switch between; the column picker; edit, which opens the
 * layouts modal; and save.
 *
 * **Undo and redo are pushed to the right**, past a spacer, because the four controls on the left
 * are all about the layout and these two are not: undo does not save, load or change the columns,
 * and sitting it next to the save glyph would read as though it undid the save. Their glyphs are the
 * content modal's own undo and redo, reached from the shared sprite so that one drawing serves both
 * places — see plans/table-undo-stack.md §10.1.
 *
 * **Both start disabled**, and become live only when the matching stack has something on it. The
 * state is read from appState here and moved by hand by markUndoState below, the same arrangement
 * the save button's `saved` class has and for the same reason: a cell edit re-renders the rows only,
 * so a button waiting for the next full render would go live at some unrelated moment.
 *
 * **What an undo did is not said here.** It is said in #output-report, the line above the file list,
 * which belongs to every view rather than to the table — see ui-functions-render/output-report.js.
 * The row is a run of controls and that report is a sentence; inside the row it would jump the row's
 * height as it appeared and wrap the buttons rather than itself at phone width.
 *
 * The name is a button in the app's understated fill rather than a bordered one: it is a place to
 * look before it is a thing to press, and it sits between a label and two icon buttons that would
 * both be crowded by a border.
 *
 * Save carries three glyphs and CSS shows one, off classes on the row and the button: waiting to
 * be saved, saving, and saved. The `saved` class comes from state here so a re-render keeps it,
 * and is moved by hand in between by the two helpers below, because the things that dirty a layout
 * (a resize drag, an auto-size) deliberately do not re-render.
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
    const { active, isDirty } = appState.tableLayouts;

    return `
            <div class="table-controls${isDirty ? '' : ' saved'}">
                <span class="layout-control-label">layout:</span>
                <button type="button" id="layout-name" class="btn-menu" popovertarget="layout-picker" data-action="layout-picker-open">${active ?? DEFAULT_LAYOUT_LABEL}</button>
                <button type="button" class="svg-wrapper-style" data-action="open-column-picker" data-tip="show and hide columns">
                    <svg viewBox="0 0 50 50"><use href="#icon-columns"></use></svg>
                </button>
                <button type="button" id="layout-edit-btn" class="svg-wrapper-style" data-action="open-layouts-modal" data-tip="add new / edit table layouts">
                    <svg viewBox="0 0 55 55"><use href="#icon-layouts"></use></svg>
                </button>
                <button type="button" id="layout-save-btn" class="svg-wrapper-style" data-action="layout-save" data-tip="save these columns to this layout">
                    <svg viewBox="0 0 50 50"><use href="#icon-save-pending"></use></svg>
                    <svg viewBox="0 0 50 50"><use href="#icon-save"></use></svg>
                    <svg viewBox="0 0 50 50"><use href="#icon-save-done"></use></svg>
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
 * helpers below rely on.
 * @returns {void}
 */
export function markUndoState() {
    const undo = document.getElementById('table-undo-btn');
    const redo = document.getElementById('table-redo-btn');

    if (undo) undo.disabled = !canReverse('undo');
    if (redo) redo.disabled = !canReverse('redo');
}

/**
 * @returns {HTMLElement|null} The control row, when the table is on screen.
 */
function controlsElement() {
    return document.querySelector('.table-controls');
}

/**
 * Records that the columns no longer match the saved layout, and shows it.
 *
 * One-way: nothing here works out whether the change put the columns back how they were. A
 * comparison would have to hold a copy of the layout to compare against, which is the machinery
 * autosave was dropped to avoid — and saving a layout that happens to be identical costs nothing.
 * @returns {void}
 */
export function markLayoutDirty() {
    appState.tableLayouts.isDirty = true;
    controlsElement()?.classList.remove('saved');
}

/**
 * Records that the columns and the saved layout are in step, and says so briefly.
 *
 * The tick in the save glyph is the lasting answer; the flash is what makes a save that changed
 * nothing on screen visible at all. It is removed on the way out so the next save can play it
 * again.
 * @returns {void}
 */
export function markLayoutSaved() {
    appState.tableLayouts.isDirty = false;
    controlsElement()?.classList.add('saved');
}

/**
 * Plays the save: the arrow glyph, spinning, for as long as the content modal's save button spins,
 * and then the tick.
 *
 * The write itself is usually done before the first frame, so the spin is not progress — it is
 * what makes a save that changes nothing on screen visible at all. The same reason
 * save-current-file.js spins after its write rather than during it.
 * @returns {void}
 */
export function playLayoutSaved() {
    // Marked straight away, not when the spin ends: the write has already happened, and a change
    // made while the spin was still playing would otherwise be wiped by the timer landing after
    // it. The delay belongs to the glyph, not to the fact.
    markLayoutSaved();

    const button = document.getElementById('layout-save-btn');
    if (!button) return;

    // The arrow glyph wins over whatever the row says for as long as it plays, so the row being
    // dirty again by then shows up the moment the class comes off.
    button.classList.add('saving');
    spinSaveArrow();
    setTimeout(() => button.classList.remove('saving'), SAVE_SPIN_MS);
}
