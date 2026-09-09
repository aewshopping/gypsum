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
 * The name appears twice on a saved layout: as the button, and as an input hidden until the edit
 * icon is clicked. Rendering both is what lets the handler start an edit by unhiding one element
 * rather than rebuilding the row, which matters because "save as new" wants the new name in edit
 * mode the moment the list is painted.
 *
 * @returns {string} HTML string for the list container's innerHTML.
 */
export function renderLayoutList() {
    const { names, active } = appState.tableLayouts;

    const row = (name, actions) => {
        const isActive = (name ?? null) === active;
        return `<div class="info-modal-row layout-row${isActive ? ' is-active' : ''}" data-layout="${name ?? ''}">` +
                 `<button type="button" class="layout-row-name" data-action="layout-select" ` +
                   `data-layout="${name ?? ''}" aria-checked="${isActive}">${name ?? DEFAULT_LAYOUT_LABEL}</button>` +
                 actions +
               `</div>`;
    };

    const actions = name =>
        `<input type="text" class="layout-row-input" data-layout="${name}" value="${name}" hidden>` +
        `<button type="button" class="info-modal-row-btn" data-action="layout-edit-name" ` +
          `data-layout="${name}" data-tip="rename this layout">` +
          `<svg class="info-modal-row-icon"><use href="#icon-edit"></use></svg></button>` +
        `<button type="button" class="info-modal-row-btn" data-action="layout-delete" ` +
          `data-layout="${name}" data-tip="delete this layout">` +
          `<svg class="info-modal-row-icon"><use href="#icon-delete"></use></svg></button>`;

    // The whole row is the button, so the icon inside it is drawn rather than pressed.
    const saveAsRow =
        `<button type="button" class="info-modal-row layout-row layout-row-new" ` +
          `data-action="layout-save-as" data-tip="save these columns as a new layout">` +
          `<span class="layout-row-name">save as new…</span>` +
          `<span class="info-modal-row-btn" aria-hidden="true">` +
            `<svg class="info-modal-row-icon"><use href="#icon-save"></use></svg></span>` +
        `</button>`;

    return [row(null, ''), ...names.map(name => row(name, actions(name))), saveAsRow].join('');
}
