// Open, close and reset for the table's column picker, and the one place its rows become state.

import { appState, TABLE_VIEW_COLUMNS } from '../../services/store.js';
import { DEFAULT_LAYOUT_LABEL } from '../ui-functions-render/render-layout-list.js';
import { renderColumnPickerList } from '../ui-functions-table/column-picker-list.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { markLayoutDirty } from '../ui-functions-table/render-table-controls.js';
import { applyActiveLayout } from '../../table-layouts/layout-file.js';

const dialog = document.getElementById('modal-columns');

/**
 * @returns {HTMLElement}
 */
function listElement() {
    return document.getElementById('column-picker-list');
}

/**
 * Fills the list and applies the floor. Both paths that put rows on screen — opening, and
 * resetting — come through here, so the floor cannot be forgotten by one of them.
 * @returns {void}
 */
function paintList() {
    listElement().innerHTML = renderColumnPickerList();
    applyVisibilityFloor();
}

/**
 * Disables the last remaining ticked toggle, so the user cannot switch off every column.
 *
 * An empty column set makes --grid-columns an empty string and produces a broken grid rather
 * than an error, so the state is made unreachable instead of being validated for. Counted off
 * the DOM: the dialog is the only thing that needs to know, and only until it closes.
 * @returns {void}
 */
function applyVisibilityFloor() {
    const toggles = [...listElement().querySelectorAll('input.toggle')];
    const shown = toggles.filter(toggle => toggle.checked);
    toggles.forEach(toggle => {
        // A locked column stays locked whatever the count, or this would hand it back.
        toggle.disabled = toggle.hasAttribute('data-always-on')
            || (shown.length === 1 && toggle.checked);
    });
}

/**
 * Opens the column picker, built fresh from the current layout.
 *
 * The title names the layout being edited. Everything in this dialog lands on the layout in use,
 * and reset now goes back to it rather than to the app's defaults, so which one that is has to be
 * on screen while the changes are being made.
 * @returns {void}
 */
export function handleOpenColumnPicker() {
    document.getElementById('column-picker-title').textContent =
        `${appState.tableLayouts.active ?? DEFAULT_LAYOUT_LABEL} layout columns`;
    paintList();
    dialog.showModal();
}

/**
 * @returns {void}
 */
export function handleCloseColumnPicker() {
    dialog.close();
}

/**
 * Keeps the floor honest as toggles are flipped. State is not written here — the dialog is read
 * as a whole when it closes.
 * @returns {void}
 */
export function handleColumnToggle() {
    applyVisibilityFloor();
}

/**
 * Ticks every column. Locked ones are already ticked, so they need no exception.
 * @returns {void}
 */
export function handleShowAllColumns() {
    listElement().querySelectorAll('input.toggle').forEach(toggle => { toggle.checked = true; });
    applyVisibilityFloor();
}

/**
 * Unticks every column except the ones that cannot be switched off, which is also what keeps the
 * floor satisfied: the file column is always there, so there is always a column left.
 * @returns {void}
 */
export function handleHideAllColumns() {
    listElement().querySelectorAll('input.toggle')
        .forEach(toggle => { toggle.checked = toggle.hasAttribute('data-always-on'); });
    applyVisibilityFloor();
}

/**
 * Throws away the changes made since the layout was last saved: order, visibility and widths
 * together. One button rather than one per axis, because "reset the order" has no useful answer
 * for a column the user has also hidden.
 *
 * It goes back to the layout in use, not to the app's defaults. Resetting to the defaults was the
 * only thing it could do before layouts existed; now that the defaults are a layout you can simply
 * choose, a button that jumps you to them from wherever you were is a worse answer than one that
 * undoes what you did.
 *
 * The Map is cleared first: applyActiveLayout only fills it, and on the app's defaults there is
 * nothing to fill it with — an empty Map is what asks resolveColumns() for the defaults.
 *
 * The table is not re-rendered here; like every other change in this dialog it lands on close.
 * @returns {Promise<void>}
 */
export async function handleResetColumns() {
    TABLE_VIEW_COLUMNS.columnLayout.clear();
    await applyActiveLayout();
    paintList();
}

/**
 * Reads the whole dialog into the layout and re-renders the table. Fires for every way of
 * finishing — the close button, Escape and clicking outside all reach it, which is what
 * closedby="any" buys.
 *
 * The Map is rebuilt in row order because the Map's key order *is* the column order, so the rows
 * as they sit are the new layout. Each entry is spread forward first, which carries a dragged
 * width across a reorder or a hide.
 *
 * The list is emptied afterwards. The dialog is a shell, and rebuilding it on every open is the
 * same arrangement the table has — nothing in the app holds rendered state between renders, and
 * a row left behind from a previous folder would look exactly like a real one.
 *
 * Nothing is written to disk here. A layout is saved when the user says so, from the layout menu.
 * @returns {void}
 */
export function handleColumnPickerClose() {
    const layout = TABLE_VIEW_COLUMNS.columnLayout;
    const previous = new Map(layout);

    layout.clear();
    listElement().querySelectorAll('.info-modal-row').forEach(row => {
        layout.set(row.dataset.property, {
            ...previous.get(row.dataset.property),
            visible: row.querySelector('input.toggle').checked,
        });
    });

    listElement().innerHTML = '';
    markLayoutDirty();
    renderFiles();
}
