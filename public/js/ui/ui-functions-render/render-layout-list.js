import { appState } from '../../services/store.js';

/** What the app's built-in defaults are called wherever a layout is named. */
export const DEFAULT_LAYOUT_LABEL = 'default';

/**
 * Renders the layouts modal's list: one row per layout, the app's defaults first, and a row at the
 * end that saves the current columns as a new layout.
 *
 * The layout in use is marked twice over — a filled row and an arrow in the gutter — because the
 * list is also how you switch, and which one you are on has to survive a glance.
 *
 * Each saved layout carries an edit and a delete icon, the same `.info-modal-row-btn` treatment
 * the history modal's row actions use. **The defaults row has neither**: there is nothing behind
 * it to rename or remove, and their absence says so better than a disabled pair would.
 *
 * The last row is a row rather than a button above the list because it does the same kind of thing
 * the rows do — it names a layout — and pressing anywhere along it acts, so the save icon on the
 * right is a label for the row rather than the only target.
 *
 * The name appears twice on a saved layout: a button to select the layout with, and a span that
 * is edited in its place. They carry the same class and the same grid cell, so the swap is
 * invisible — the word being renamed is the word that was on screen, in the same position and the
 * same type.
 *
 * Two elements rather than one editable button, because a <button> activates on space: the
 * character never reaches the text, and the button fires a click for each one. Rather than fight
 * that, the button is a button and the editable twin is a plain span.
 *
 * @returns {string} HTML string for the list container's innerHTML.
 */
export function renderLayoutList() {
    const { names, active } = appState.tableLayouts;

    const row = (name, actions) => {
        const isActive = (name ?? null) === active;
        return `<div class="info-modal-row layout-row${isActive ? ' is-active' : ''}" data-layout="${name ?? ''}">` +
                 `<button type="button" class="layout-row-name" data-action="layout-select" ` +
                   `data-layout="${name ?? ''}" aria-current="${isActive}">${name ?? DEFAULT_LAYOUT_LABEL}</button>` +
                 actions +
               `</div>`;
    };

    const actions = name =>
        `<span class="layout-row-name layout-row-rename" data-layout="${name}" hidden>${name}</span>` +
        `<button type="button" class="info-modal-row-btn" data-action="layout-edit-name" ` +
          `data-layout="${name}" data-tip="rename this layout">` +
          `<svg class="info-modal-row-icon"><use href="#icon-edit"></use></svg></button>` +
        `<button type="button" class="info-modal-row-btn" data-action="layout-delete" ` +
          `data-layout="${name}" data-tip="delete this layout">` +
          `<svg class="info-modal-row-icon"><use href="#icon-delete"></use></svg></button>`;

    // The whole row is the button, so the icon inside it is drawn rather than pressed. The empty
    // span takes the edit column, which is what puts the save icon in the same column as the
    // delete icons above it rather than in the one next to them.
    const saveAsRow =
        `<button type="button" class="info-modal-row layout-row layout-row-new" ` +
          `data-action="layout-save-as" data-tip="save these columns as a new layout">` +
          `<span class="layout-row-name">save as new…</span>` +
          `<span aria-hidden="true"></span>` +
          `<span class="info-modal-row-btn" aria-hidden="true">` +
            `<svg class="info-modal-row-icon"><use href="#icon-save-pending"></use></svg></span>` +
        `</button>`;

    return [row(null, ''), ...names.map(name => row(name, actions(name))), saveAsRow].join('');
}

/**
 * Renders the layout picker's rows: one per layout, the app's defaults first.
 *
 * Just the names — switching is all this popover does, which is why it exists beside the modal
 * rather than instead of it. It shares .app-menu with the column options menu, so the two menus
 * in the table's chrome are one thing wearing two anchors.
 *
 * @returns {string} HTML string for the picker's innerHTML.
 */
export function renderLayoutPicker() {
    const { names, active } = appState.tableLayouts;

    const item = name =>
        `<button type="button" class="app-menu-item" data-action="layout-select" ` +
          `data-layout="${name ?? ''}" aria-current="${(name ?? null) === active}">` +
          `${name ?? DEFAULT_LAYOUT_LABEL}</button>`;

    return [item(null), ...names.map(item)].join('');
}
