/**
 * @file The saved-layouts menu, opened from the layout name in the table's control row, and the
 * small dialog that names a layout.
 *
 * The only part of the layouts feature that touches the DOM. Everything it does to a layout goes
 * through table-layouts/layout-file.js; nothing here writes columnLayout directly.
 *
 * The menu is a popover, so the browser handles the top layer, light dismiss and Escape. Unlike
 * the column menu it anchors straight to its own button — the control row carries no scroll-driven
 * transform, so there is no proxy to park.
 */

import { appState } from '../../services/store.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { DEFAULT_LAYOUT_LABEL } from '../ui-functions-table/render-table-controls.js';
import { saveLayout, renameLayout, deleteLayout, setActiveLayout } from '../../table-layouts/layout-file.js';
import { showWarningModal } from './warning-modal.js';

/** Which of the two jobs the name dialog is doing: 'save-as' or 'rename'. */
let _namingMode = 'save-as';

/**
 * @returns {HTMLElement|null}
 */
function menuElement() {
    return document.getElementById('layout-menu');
}

/**
 * @returns {HTMLDialogElement|null}
 */
function nameDialog() {
    return document.getElementById('modal-layout-name');
}

/**
 * Fills the menu's list of layouts and enables the items that need one.
 *
 * The names are rebuilt on every open rather than kept in the DOM, for the same reason the column
 * picker is: they change as layouts are added and removed, and a row left over from a previous
 * folder would look exactly like a real one.
 * @returns {void}
 */
function paintMenu() {
    const { names, active } = appState.tableLayouts;

    const row = (value, label) => `<button type="button" class="app-menu-item"
        data-action="layout-select" data-layout="${value ?? ''}"
        aria-checked="${(value ?? null) === active}">${label}</button>`;

    document.getElementById('layout-menu-names').innerHTML =
        [row(null, DEFAULT_LAYOUT_LABEL), ...names.map(name => row(name, name))].join('');

    // There is nothing behind the app defaults to save over, rename or remove. "save as new" is
    // the way out of that state, which is why it is the one item that is always available.
    const menu = menuElement();
    for (const action of ['layout-save', 'layout-rename', 'layout-delete']) {
        menu.querySelector(`[data-action="${action}"]`).disabled = active === null;
    }
}

/**
 * Fills the menu before the browser shows it. The button carries popovertarget, so opening is the
 * browser's job — this only has to make the contents right first.
 * @returns {void}
 */
export function handleLayoutMenuOpen() {
    paintMenu();
}

/**
 * Switches to the clicked layout, or to the app's defaults.
 * @param {MouseEvent} evt
 * @param {HTMLElement} target - The menu row carrying data-layout.
 * @returns {Promise<void>}
 */
export async function handleLayoutSelect(evt, target) {
    menuElement()?.hidePopover();
    await setActiveLayout(target.dataset.layout || null);
    renderFiles();
}

/**
 * Opens the name dialog for whichever of the two jobs asked for it.
 * @param {'save-as'|'rename'} mode
 * @param {string} value - What the input starts with.
 * @returns {void}
 */
function openNameDialog(mode, value) {
    _namingMode = mode;
    document.getElementById('layout-name-title').textContent =
        mode === 'save-as' ? 'Save layout as' : 'Rename layout';
    document.getElementById('layout-name-confirm').textContent =
        mode === 'save-as' ? 'save' : 'rename';

    const input = document.getElementById('layout-name-input');
    input.value = value;
    document.getElementById('layout-name-error').hidden = true;

    menuElement()?.hidePopover();
    nameDialog().showModal();
    input.select();
}

/**
 * Writes the columns as they are now to the layout in use. Disabled on the app defaults, which
 * have no layout behind them to save over.
 * @returns {Promise<void>}
 */
export async function handleLayoutSave() {
    const name = appState.tableLayouts.active;
    if (!name) return;

    menuElement()?.hidePopover();
    await saveLayout(name);
}

/**
 * @returns {void}
 */
export function handleLayoutSaveAs() {
    openNameDialog('save-as', '');
}

/**
 * @returns {void}
 */
export function handleLayoutRename() {
    openNameDialog('rename', appState.tableLayouts.active ?? '');
}

/**
 * Applies the name dialog. The name is checked here rather than trusted: it is what the user
 * typed, which is the app's bar for validating — an empty name would be unreachable in the menu
 * and a repeated one would silently replace a layout the user still wanted.
 * @returns {Promise<void>}
 */
export async function handleLayoutNameConfirm() {
    const name = document.getElementById('layout-name-input').value.trim();
    const { names, active } = appState.tableLayouts;

    // Renaming a layout to the name it already has is a no-op, not a clash. Saving a new one
    // over the active layout is still a clash — that is the case this stops being silent.
    const taken = _namingMode === 'rename'
        ? (names.includes(name) && name !== active)
        : names.includes(name);

    const problem = !name ? 'give the layout a name'
        : taken ? 'there is already a layout with that name'
        : null;

    if (problem) {
        const error = document.getElementById('layout-name-error');
        error.textContent = problem;
        error.hidden = false;
        return;
    }

    nameDialog().close();
    if (_namingMode === 'save-as') await saveLayout(name);
    else await renameLayout(active, name);
    renderFiles();
}

/**
 * @returns {void}
 */
export function handleLayoutNameCancel() {
    nameDialog().close();
}

/**
 * Deletes the active layout, once the user has agreed to it. A layout is a file on the user's
 * disk, which is the bar delete-file already sets for asking first.
 *
 * The columns on screen are left exactly as they are: deleting the record of an arrangement does
 * not disturb the arrangement, it only stops it being restored next time.
 * @returns {Promise<void>}
 */
export async function handleLayoutDelete() {
    const name = appState.tableLayouts.active;
    if (!name) return;

    menuElement()?.hidePopover();
    const confirmed = await showWarningModal(
        `Delete the layout "${name}"? The columns on screen stay as they are.`,
        'delete layout', 'cancel');
    if (!confirmed) return;

    await deleteLayout(name);
    renderFiles();
}
