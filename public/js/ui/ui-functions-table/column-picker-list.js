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
    return resolveColumns().map(column => {
        const label = column.label ?? column.name;
        const checked = column.visible ? ' checked' : '';

        return `<div class="info-modal-row" data-property="${column.name}">` +
                 `<button type="button" class="info-modal-row-btn info-modal-row-grip" tabindex="-1" data-action="column-reorder-start" data-tip="drag to reorder this column">` +
                   `<svg class="info-modal-row-icon"><use href="#icon-drag"></use></svg></button>` +
                 `<span class="info-modal-row-label">${label}</span>` +
                 `<input type="checkbox" class="toggle" data-action="column-toggle" data-tip="show this column"${checked}>` +
               `</div>`;
    }).join('');
}
