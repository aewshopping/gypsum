import { appState } from '../../services/store.js';
import { DEFAULT_LAYOUT_LABEL } from '../ui-functions-render/render-layout-list.js';

/**
 * Renders the table's control row: the layout in use, and the three things you can do to it.
 *
 * Reading left to right it says what the table is showing and then offers to change it — the
 * name, an edit button that opens the layouts modal, the column picker, and save. The name is a
 * label rather than a button: hovering the edit button inverts them together, which is what says
 * the button acts on the name, the same gesture the content modal's file-options button makes
 * over the history select.
 *
 * The save glyphs' outer viewBox starts at 0 0 rather than repeating the symbol's own 5 5 50 50:
 * a <use> is placed at the origin of the box it sits in, so a viewBox starting at 5 5 offsets the
 * glyph up and left by five units and clips it. Only the aspect ratio has to match.
 *
 * Save carries two glyphs and CSS shows one, off the `saved` class on the row — the same
 * arrangement #save-btn has inside the content modal. The class comes from state here so a
 * re-render keeps it, and is moved by hand in between by the two helpers below, because the
 * things that dirty a layout (a resize drag, an auto-size) deliberately do not re-render.
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
                <span id="layout-name" class="layout-name">${active ?? DEFAULT_LAYOUT_LABEL}</span>
                <button type="button" id="layout-edit-btn" class="svg-wrapper-style" data-action="open-layouts-modal" data-tip="saved table layouts">
                    <svg viewBox="0 0 82.2 79.5"><use href="#icon-edit"></use></svg>
                </button>
                <button type="button" class="svg-wrapper-style" data-action="open-column-picker" data-tip="show and hide columns">
                    <svg viewBox="0 0 50 50"><use href="#icon-columns"></use></svg>
                </button>
                <button type="button" id="layout-save-btn" class="svg-wrapper-style" data-action="layout-save" data-tip="save these columns to this layout">
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

    const controls = controlsElement();
    if (!controls) return;

    controls.classList.add('saved');
    const button = document.getElementById('layout-save-btn');
    button?.classList.remove('just-saved');
    void button?.offsetWidth;      // restart the animation rather than let a repeat be ignored
    button?.classList.add('just-saved');
}
