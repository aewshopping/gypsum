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
 * Each saved layout carries a save, an edit and a delete icon, the same `.info-modal-row-btn`
 * treatment the history modal's row actions use. **The defaults row has none**: there is nothing
 * behind it to rename or remove, and nothing to save over either — the way to keep the columns
 * showing under the defaults is "save as new". Their absence says so better than a disabled set
 * would.
 *
 * **Save is drawn only on the active row**, which is what makes it mean "save *this* layout": the
 * columns on screen belong to the layout in use, so saving any other row would be writing them
 * somewhere they never came from. The other rows keep an empty cell in its place so that the edit
 * and delete icons stay in line down the list.
 *
 * It carries the same three glyphs the control row's save button used to — waiting to be saved,
 * saving, and saved — and table-layouts.css shows one of them, off a class on #layout-list that
 * paintList sets from `isDirty`. The row rather than the button holds that class for the same
 * reason the control row used to: a re-render of the list has to keep it.
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

    // Three glyphs, one shown, in the order the CSS counts them: pending, saving, saved.
    const saveButton =
        `<button type="button" id="layout-save-btn" class="info-modal-row-btn" ` +
          `data-action="layout-save" data-tip="save these columns to this layout">` +
          `<svg class="info-modal-row-icon"><use href="#icon-save-pending"></use></svg>` +
          `<svg class="info-modal-row-icon"><use href="#icon-save"></use></svg>` +
          `<svg class="info-modal-row-icon"><use href="#icon-save-done"></use></svg></button>`;

    const actions = name =>
        `<span class="layout-row-name layout-row-rename" data-layout="${name}" hidden>${name}</span>` +
        (name === active ? saveButton : `<span class="info-modal-row-btn" aria-hidden="true"></span>`) +
        `<button type="button" class="info-modal-row-btn" data-action="layout-edit-name" ` +
          `data-layout="${name}" data-tip="rename this layout">` +
          `<svg class="info-modal-row-icon"><use href="#icon-edit"></use></svg></button>` +
        `<button type="button" class="info-modal-row-btn" data-action="layout-delete" ` +
          `data-layout="${name}" data-tip="delete this layout">` +
          `<svg class="info-modal-row-icon"><use href="#icon-delete"></use></svg></button>`;

    // The whole row is the button, so the icon inside it is drawn rather than pressed. The two
    // empty spans take the rename and save columns, which is what puts the save icon in the same
    // column as the delete icons above it rather than in one of the ones next to them.
    const saveAsRow =
        `<button type="button" class="info-modal-row layout-row layout-row-new" ` +
          `data-action="layout-save-as" data-tip="save these columns as a new layout">` +
          `<span class="layout-row-name">save as new…</span>` +
          `<span aria-hidden="true"></span>` +
          `<span aria-hidden="true"></span>` +
          `<span class="info-modal-row-btn" aria-hidden="true">` +
            `<svg class="info-modal-row-icon"><use href="#icon-save-pending"></use></svg></span>` +
        `</button>`;

    return [row(null, ''), ...names.map(name => row(name, actions(name))), saveAsRow].join('');
}
