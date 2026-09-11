import { appState } from '../../services/store.js';
import { resolveColumns } from './render-table-columns-helper.js';

/**
 * Renders the column picker's rows: one per candidate column, in the table's own order, ticked
 * when that column is shown.
 *
 * Built from resolveColumns(), the same call the table renders from — the table takes the shown
 * entries and this takes all of them, so the picker and the table cannot disagree about what
 * exists or what order it is in. The row order in this list *is* the column order, hidden rows
 * included, which is why the hidden ones are listed rather than filtered out.
 *
 * The label matches the column header (render-table-header.js): whichever name FILE_PROPERTIES
 * gives, falling back to the property's own.
 *
 * data-property is what lets the close handler read a row back to a column; it is on the row
 * rather than the toggle because it identifies the row as a whole, grip included.
 *
 * A column marked alwaysOn is ticked and locked: the file column is the only way to open a file
 * from the table, so it is offered here for its place in the order rather than for switching off.
 * data-always-on says so to the handlers, which would otherwise re-enable it.
 *
 * A dead column — one the layout remembers but the folder no longer has — is locked as it stands
 * rather than at a value of its own: there is nothing to show in it, so switching it on would put
 * an empty column on screen and switching it off would quietly rewrite the layout. data-dead says
 * so to the handlers, the same way data-always-on does. It is offered a bin instead, which is the
 * one useful thing to do with it, and only when a layout is in force — under the app defaults
 * there is no saved layout for it to be removed from.
 *
 * Every row carries something in the bin's slot so the toggles stay in one column down the list,
 * a spacer where there is no bin to draw.
 *
 * No floor logic here — a renderer returns HTML. Disabling the last remaining toggle is applied
 * to the DOM afterwards by column-picker.js.
 *
 * The grip is out of the tab order. Reordering is pointer-only, so as a tab stop it took focus,
 * showed a ring and a "drag to reorder" tooltip, and then ignored every key pressed at it — one
 * dead stop per column between the keyboard and the toggles. Better to leave it unreachable than
 * to advertise a control that is not there. Giving it a real key path (pick up, arrows, drop) is
 * its own piece of work; see plans/table-column-visibility.md §7.
 *
 * @returns {string} HTML string for #column-picker-list's innerHTML.
 */
export function renderColumnPickerList() {
    const underSavedLayout = appState.tableLayouts.active !== null;

    return resolveColumns().map(column => {
        const label = column.label ?? column.name;
        const checked = column.visible ? ' checked' : '';
        const locked = column.alwaysOn ? ' disabled data-always-on'
                     : column.dead     ? ' disabled data-dead'
                     : '';
        const tip = column.alwaysOn ? 'always shown'
                  : column.dead     ? 'this property is not in the loaded folder'
                  : 'show this column';

        const bin = (column.dead && underSavedLayout)
            ? `<button type="button" class="info-modal-row-btn" data-action="column-delete" data-property="${column.name}" data-tip="remove this column from the layout">` +
                `<svg class="info-modal-row-icon"><use href="#icon-delete"></use></svg></button>`
            : `<span class="info-modal-row-spacer"></span>`;

        return `<div class="info-modal-row" data-property="${column.name}">` +
                 `<button type="button" class="info-modal-row-btn info-modal-row-grip" tabindex="-1" data-action="column-reorder-start" data-tip="drag to reorder this column">` +
                   `<svg class="info-modal-row-icon"><use href="#icon-drag"></use></svg></button>` +
                 `<span class="info-modal-row-label">${label}</span>` +
                 bin +
                 `<input type="checkbox" class="toggle" data-action="column-toggle" data-tip="${tip}"${checked}${locked}>` +
               `</div>`;
    }).join('');
}
