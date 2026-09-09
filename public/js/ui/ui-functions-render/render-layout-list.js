import { appState } from '../../services/store.js';

/** What the app's built-in defaults are called wherever a layout is named. */
export const DEFAULT_LAYOUT_LABEL = 'default';

/**
 * Renders the layouts modal's list: one row per layout, the app's defaults first.
 *
 * Each row carries the layout's name as a button that switches to it, and — for a saved layout —
 * an edit and a delete icon on the right, the same `.info-modal-row-btn` treatment the history
 * modal's row actions use.
 *
 * **The defaults row has no icons.** There is no file behind it to rename or remove, and a
 * disabled pair of icons on every list would say that less clearly than their absence does.
 *
 * The name appears twice: as the button, and as an input that is hidden until the edit icon is
 * clicked. Rendering both is what lets the handler start an edit by unhiding one element rather
 * than rebuilding the row, which matters because "save as new" wants the new name in edit mode
 * the moment the list is painted.
 *
 * @returns {string} HTML string for the list container's innerHTML.
 */
export function renderLayoutList() {
    const { names, active } = appState.tableLayouts;

    const row = (name, label, actions) =>
        `<div class="info-modal-row layout-row" data-layout="${name ?? ''}">` +
          `<button type="button" class="layout-row-name" data-action="layout-select" ` +
            `data-layout="${name ?? ''}" aria-checked="${(name ?? null) === active}">${label}</button>` +
          actions +
        `</div>`;

    const iconButtons = name =>
        `<input type="text" class="layout-row-input" data-action="layout-name-input" ` +
          `data-layout="${name}" value="${name}" hidden>` +
        `<button type="button" class="info-modal-row-btn" data-action="layout-edit-name" ` +
          `data-layout="${name}" data-tip="rename this layout">` +
          `<svg class="info-modal-row-icon"><use href="#icon-edit"></use></svg></button>` +
        `<button type="button" class="info-modal-row-btn" data-action="layout-delete" ` +
          `data-layout="${name}" data-tip="delete this layout">` +
          `<svg class="info-modal-row-icon"><use href="#icon-delete"></use></svg></button>`;

    return [row(null, DEFAULT_LAYOUT_LABEL, ''), ...names.map(name => row(name, name, iconButtons(name)))]
        .join('');
}
