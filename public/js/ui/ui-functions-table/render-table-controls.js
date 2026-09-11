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
                <button type="button" id="layout-name" class="btn-menu" popovertarget="layout-picker" data-action="layout-picker-open">${active ?? DEFAULT_LAYOUT_LABEL}</button>
                <button type="button" class="svg-wrapper-style" data-action="open-column-picker" data-tip="show and hide columns">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="4" d="M11.474 18.79c.03 4.09.16 20.45.19 24.54m-.19-24.54c.03 4.09.16 20.45.19 24.54M26.415 18.347c.01 4.1.03 20.5.03 24.6m-.03-24.6c.01 4.1.03 20.5.03 24.6M39.254 18.078v25.96m0-25.96v25.96M10 10.17c.71.01 3.53.04 4.23.05M10 10.17c.71.01 3.53.04 4.23.05M23.879 10.17c.6-.03 2.98-.14 3.58-.17m-3.58.17c.6-.03 2.98-.14 3.58-.17M36.665 10.17c.69-.03 3.43-.14 4.12-.17m-4.12.17c.69-.03 3.43-.14 4.12-.17"/></svg>
                </button>
                <button type="button" id="layout-edit-btn" class="svg-wrapper-style" data-action="open-layouts-modal" data-tip="add new / edit table layouts">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 55 55"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="4" d="M28.13 21.978c-.07 1.47-.47 4.8-.41 8.83.05 4.04.61 12.82.74 15.38m-.33-24.21c-.07 1.47-.47 4.8-.41 8.83.05 4.04.61 12.82.74 15.38M10.75 11.589c2.3-.26 7.92-1.33 13.78-1.54 5.86-.2 17.82.26 21.38.31m-35.16 1.23c2.3-.26 7.92-1.33 13.78-1.54 5.86-.2 17.82.26 21.38.31M45.99 20.323c-3.09.13-12.68.6-18.57.8s-13.97.33-16.77.4m35.34-1.2c-3.09.13-12.68.6-18.57.8s-13.97.33-16.77.4"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="4" d="M11.452 10.54c.03 5.52-3.41 27.15.2 33.14 3.61 5.98 17.9 2.31 21.48 2.77m-21.68-35.91c.03 5.52-3.41 27.15.2 33.14 3.61 5.98 17.9 2.31 21.48 2.77"/><path fill="none" stroke="currentColor " stroke-linecap="round" stroke-width="4" d="M29.819 31.901c-2.99.13-14.97.67-17.97.8m17.97-.8c-2.99.13-14.97.67-17.97.8M46.189 10.141c.06 2.1.32 10.48.39 12.58m-.39-12.58c.06 2.1.32 10.48.39 12.58M34.81 37.292c2.6-.17 12.98-.83 15.57-1m-15.57 1c2.6-.17 12.98-.83 15.57-1"/><path fill="none" stroke="currentColor " stroke-linecap="round" stroke-width="4" d="M42.995 29.306c-.03 2.53-.17 12.64-.2 15.17m.2-15.17c-.03 2.53-.17 12.64-.2 15.17"/></svg>
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
