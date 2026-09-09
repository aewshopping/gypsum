import { appState } from '../../services/store.js';
import { DEFAULT_LAYOUT_LABEL } from '../ui-functions-render/render-layout-list.js';
import { spinSaveArrow, SAVE_SPIN_MS } from '../save-spin.js';

/**
 * Renders the table's control row: the layout in use, and the three things you can do to it.
 *
 * Reading left to right it says what the table is showing and then offers to change it — the name,
 * which opens a list of the layouts to switch between; the column picker; edit, which opens the
 * layouts modal; and save.
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
                <button type="button" id="layout-name" class="layout-name" popovertarget="layout-picker" data-action="layout-picker-open">${active ?? DEFAULT_LAYOUT_LABEL}</button>
                <button type="button" class="svg-wrapper-style" data-action="open-column-picker" data-tip="show and hide columns">
                    <svg viewBox="0 0 50 50"><use href="#icon-columns"></use></svg>
                </button>
                <button type="button" id="layout-edit-btn" class="svg-wrapper-style" data-action="open-layouts-modal" data-tip="add new / edit table layouts">
                    <svg viewBox="0 0 82.2 79.5"><use href="#icon-edit"></use></svg>
                </button>
                <button type="button" id="layout-save-btn" class="svg-wrapper-style" data-action="layout-save" data-tip="save these columns to this layout">
                    <svg viewBox="0 0 50 50"><use href="#icon-save-pending"></use></svg>
                    <svg viewBox="0 0 50 50"><use href="#icon-save"></use></svg>
                    <svg viewBox="0 0 50 50"><use href="#icon-save-done"></use></svg>
                </button>
            </div>`;
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
