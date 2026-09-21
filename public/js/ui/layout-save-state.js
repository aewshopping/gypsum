/**
 * @file Whether the columns match the layout they came from, and the save button that says so.
 *
 * The button lives on the active layout's row inside the layouts modal, so this is separate from
 * the renderer of the row it sits on and from the renderer of the control row it used to sit in:
 * the things that dirty a layout — a resize drag, an auto-size, a column hidden — are nowhere near
 * either, and they all need to say so.
 *
 * Every function here is a no-op when the modal is closed, which is most of the time. The lasting
 * answer is `appState.tableLayouts.isDirty`, which paintList reads whenever the modal opens; the
 * DOM work is only for the case where it is already open.
 */

import { appState } from '../services/store.js';
import { spinSaveArrow, SAVE_SPIN_MS } from './save-spin.js';

/**
 * @returns {HTMLElement|null} The layouts modal's list, when the modal has been painted.
 */
function listElement() {
    return document.getElementById('layout-list');
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
    listElement()?.classList.remove('saved');
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
    listElement()?.classList.add('saved');
}

/**
 * Plays the save: the arrow glyph, spinning, for as long as the content modal's save button spins,
 * and then the tick.
 *
 * The write itself is usually done before the first frame, so the spin is not progress — it is
 * what makes a save that changes nothing on screen visible at all. The same reason
 * save-current-file.js spins after its write rather than during it.
 *
 * **Call it after any repaint of the list**, not before: the button it decorates is replaced by
 * one, and the timer below would then be taking a class off an element nobody can see.
 * @returns {void}
 */
export function playLayoutSaved() {
    // Marked straight away, not when the spin ends: the write has already happened, and a change
    // made while the spin was still playing would otherwise be wiped by the timer landing after
    // it. The delay belongs to the glyph, not to the fact.
    markLayoutSaved();

    const button = document.getElementById('layout-save-btn');
    if (!button) return;

    // The arrow glyph wins over whatever the list says for as long as it plays, so the layout being
    // dirty again by then shows up the moment the class comes off.
    button.classList.add('saving');
    spinSaveArrow();
    setTimeout(() => button.classList.remove('saving'), SAVE_SPIN_MS);
}
