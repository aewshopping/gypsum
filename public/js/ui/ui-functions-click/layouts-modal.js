/**
 * @file The saved-layouts modal, opened from the layout name in the table's control row.
 *
 * The only part of the layouts feature that touches the DOM. Everything it does to a layout goes
 * through table-layouts/layout-file.js; nothing here writes columnLayout directly.
 *
 * Renaming happens in the row itself rather than in a dialog of its own. A modal that exists only
 * to collect one word, on top of the modal that listed the word, is a lot of furniture for a
 * rename — and the same in-place edit is what "save as new" needs, since it names the new layout
 * itself and then hands the name straight to the user to change.
 */

import { appState } from '../../services/store.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { renderLayoutList, renderLayoutPicker } from '../ui-functions-render/render-layout-list.js';
import { playLayoutSaved } from '../ui-functions-table/render-table-controls.js';
import { saveLayout, renameLayout, deleteLayout, setActiveLayout, nextLayoutName }
    from '../../table-layouts/layout-file.js';
import { showWarningModal } from './warning-modal.js';

/** The layout whose row is currently being renamed, or null. Guards the commit against re-entry. */
let _editing = null;

/**
 * @returns {HTMLDialogElement}
 */
function dialog() {
    return document.getElementById('modal-layouts');
}

/**
 * @returns {HTMLElement}
 */
function listElement() {
    return document.getElementById('layout-list');
}

/**
 * @returns {void}
 */
function paintList() {
    listElement().innerHTML = renderLayoutList();
}

/**
 * Swaps a row's name button for its input and puts the cursor in it. The input is already in the
 * markup, hidden, so starting an edit is showing one element rather than rebuilding the row —
 * which is what lets a freshly created layout be handed over for renaming the moment it appears.
 * @param {string} name
 * @returns {void}
 */
function startEditing(name) {
    const row = listElement().querySelector(`.layout-row[data-layout="${CSS.escape(name)}"]`);
    if (!row) return;

    row.querySelector('.layout-row-name').hidden = true;
    const input = row.querySelector('.layout-row-input');
    input.hidden = false;
    input.focus();
    input.select();
    _editing = name;
}

/**
 * Applies an in-place rename, or puts the row back as it was.
 *
 * An empty name, an unchanged one, or one already taken is not a rename — the row simply returns
 * to its button. Saying so in the modal would need somewhere to say it, and the name the user can
 * still see is a clearer answer than a message would be.
 * @param {HTMLInputElement} input
 * @returns {Promise<void>}
 */
async function commitEdit(input) {
    const from = _editing;
    if (!from) return;

    // Cleared first: repainting the list below moves focus, which comes back through here.
    _editing = null;
    const to = input.value.trim();

    if (to && to !== from && !appState.tableLayouts.names.includes(to)) {
        await renameLayout(from, to);
        renderFiles();   // the control row names the active layout
    }
    paintList();
}

/**
 * Builds the list and opens the modal.
 * @returns {void}
 */
export function handleOpenLayoutsModal() {
    paintList();
    dialog().showModal();
}

/**
 * @returns {void}
 */
export function handleCloseLayoutsModal() {
    dialog().close();
}

/**
 * Switches to the clicked layout, or to the app's defaults.
 * @param {MouseEvent} evt
 * @param {HTMLElement} target - The row's name button, carrying data-layout.
 * @returns {Promise<void>}
 */
export async function handleLayoutSelect(evt, target) {
    // The picker is a menu and is done once something is picked; the modal is a place you are
    // working in, so choosing a layout there moves the marker and leaves you where you were.
    document.getElementById('layout-picker')?.hidePopover();

    await setActiveLayout(target.dataset.layout || null);
    renderFiles();
    if (dialog().open) paintList();
}

/**
 * Fills the layout picker before the browser shows it. The button carries popovertarget, so
 * opening is the browser's job — this only has to make the contents right first.
 * @returns {void}
 */
export function handleLayoutPickerOpen() {
    document.getElementById('layout-picker').innerHTML = renderLayoutPicker();
}

/**
 * Saves the current columns to a new layout, names it for the user, and hands the name straight
 * back for editing. Opens the modal if it is not already up, which is how the control row's save
 * button behaves on the app defaults.
 * @returns {Promise<void>}
 */
async function createLayout() {
    const name = nextLayoutName(appState.tableLayouts.names);
    await saveLayout(name);
    renderFiles();
    playLayoutSaved();

    paintList();
    if (!dialog().open) dialog().showModal();
    startEditing(name);
}

/**
 * Save, from either the control row or the modal.
 *
 * On a saved layout it writes over that layout and says nothing. On the app defaults there is no
 * layout to write over, so it makes one — which is the same thing "save as new" does, and the
 * reason the button can stay labelled "save" in both states.
 * @returns {Promise<void>}
 */
export async function handleLayoutSave() {
    const { active } = appState.tableLayouts;
    if (active) {
        await saveLayout(active);
        playLayoutSaved();
        return;
    }
    await createLayout();
}

/**
 * @returns {Promise<void>}
 */
export async function handleLayoutSaveAs() {
    await createLayout();
}

/**
 * @param {MouseEvent} evt
 * @param {HTMLElement} target - The edit button, carrying data-layout.
 * @returns {void}
 */
export function handleLayoutEditName(evt, target) {
    startEditing(target.dataset.layout);
}

/**
 * Commits a rename when the input loses focus. Bound to the document because focus events do not
 * bubble in the form this needs — the same arrangement handleTableHeaderFocus uses — so it leaves
 * immediately unless the thing being left is a name being edited.
 * @param {FocusEvent} evt
 * @returns {void}
 */
export function handleLayoutNameBlur(evt) {
    if (_editing && evt.target.matches?.('.layout-row-input')) commitEdit(evt.target);
}

/**
 * Enter commits a rename and Escape abandons it. Escape is stopped from travelling on, or the
 * dialog's own light dismiss would close the whole modal on the way out of a single field.
 * @param {KeyboardEvent} evt
 * @returns {void}
 */
export function handleLayoutNameKeydown(evt) {
    if (!_editing || !evt.target.matches?.('.layout-row-input')) return;

    if (evt.key === 'Enter') {
        evt.preventDefault();
        evt.target.blur();   // reaches commitEdit through the blur handler above
    } else if (evt.key === 'Escape') {
        evt.preventDefault();
        evt.stopPropagation();
        _editing = null;
        paintList();
    }
}

/**
 * Deletes a layout, once the user has agreed to it. A layout is a file on the user's disk, which
 * is the bar delete-file already sets for asking first.
 *
 * The columns on screen are left exactly as they are: deleting the record of an arrangement does
 * not disturb the arrangement, it only stops it being restored next time.
 * @param {MouseEvent} evt
 * @param {HTMLElement} target - The delete button, carrying data-layout.
 * @returns {Promise<void>}
 */
export async function handleLayoutDelete(evt, target) {
    const name = target.dataset.layout;

    const confirmed = await showWarningModal(
        `Delete the layout "${name}"? The columns on screen stay as they are.`,
        'delete layout', 'cancel');
    if (!confirmed) return;

    await deleteLayout(name);
    renderFiles();
    paintList();
}
