import { appState, TABLE_VIEW_COLUMNS } from '../../services/store.js';
import { VALUE_TYPES, SEARCH_TYPES, labelFor } from '../../constants.js';
import { isInfoColumn, isTypeSettable } from '../../services/property-type.js';
import { typeGlyph } from '../ui-functions-render/type-glyph.js';
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
 * The bin and the toggle share one box at the end of the row, so a row without a bin gives up no
 * space to it and every toggle sits against the same edge — see column-picker.css, where the row
 * is a grid and that box is its last track.
 *
 * The type glyph sits in that box too, on every row, drawn by the same builder the table header
 * uses — so a column reads the same in both places. A column the app fills in wears the padlock,
 * and its button is inert; an info column wears the info drawing under it. Drawn per type rather
 * than described in words, so the list can be read down rather than one tooltip at a time, and
 * drawn locked rather than merely faded, so what the button will refuse is on screen before it is
 * pressed.
 *
 * The row carries the resolved type and search type as data attributes. That is where the popover
 * writes a change to, and where column-picker.js reads the row back from when the dialog closes,
 * so a type follows exactly the path the order and the visibility already take.

 *
 * No floor logic here — a renderer returns HTML. Disabling the last remaining toggle is applied
 * to the DOM afterwards by column-picker.js.
 *
 * The grip is out of the tab order. Reordering is pointer-only, so as a tab stop it took focus,
 * showed a ring and a "drag to reorder" tooltip, and then ignored every key pressed at it — one
 * dead stop per column between the keyboard and the toggles. Better to leave it unreachable than
 * to advertise a control that is not there. Giving it a real key path (pick up, arrows, drop) is
 * its own piece of work; see plans/completed/table-column-visibility.md §7.
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

        // No type to set on a column the app owns — the same question the header's padlock asks, and
        // now the same answer, since typeGlyph draws that padlock here too. Three of them, told
        // apart only by what the tooltip says: a control column, whose cell holds a link rather than
        // a value and so has no type at all; an info column, which the app fills in; and everything
        // else the app fills in, which is title, tags and the rest of CORE_FILE_PROPERTIES. The last
        // two keep their type in the tooltip, because it is still what the column sorts by.
        const isControl = TABLE_VIEW_COLUMNS.control_columns.includes(column.name);
        const isInfo = isInfoColumn(column.name);
        const noType = !isTypeSettable(column.name);
        const typeLabel = labelFor(VALUE_TYPES, column.type);
        const spelledOut = column.type === VALUE_TYPES.ARRAY.value
            ? `${typeLabel}, ${labelFor(SEARCH_TYPES, column.search_type)}`
            : typeLabel;
        const typeTip = isControl ? 'this column opens the file, so it has no type'
                      : isInfo ? `info — ${typeLabel}, filled in by the app`
                      : noType ? `${spelledOut} — set by the app`
                      : spelledOut;

        const bin = (column.dead && underSavedLayout)
            ? `<button type="button" class="info-modal-row-btn" data-action="column-delete" data-property="${column.name}" data-tip="remove this column from the layout">` +
                `<svg class="info-modal-row-icon"><use href="#icon-delete"></use></svg></button>`
            : '';

        return `<div class="info-modal-row" data-property="${column.name}"` +
                 ` data-type="${column.type}" data-search-type="${column.search_type}">` +
                 `<button type="button" class="info-modal-row-btn info-modal-row-grip" tabindex="-1" data-action="column-reorder-start" data-tip="drag to reorder this column">` +
                   `<svg class="info-modal-row-icon"><use href="#icon-drag"></use></svg></button>` +
                 `<span class="info-modal-row-label">${label}</span>` +
                 `<span class="column-picker-actions">` +
                   `<button type="button" class="info-modal-row-btn column-picker-type" data-action="column-type-open" data-tip="${typeTip}"${noType ? ' disabled' : ''}>` +
                     typeGlyph(column, 'info-modal-row-icon') + `</button>` +
                   bin +
                   `<input type="checkbox" class="toggle" data-action="column-toggle" data-tip="${tip}"${checked}${locked}>` +
                 `</span>` +
               `</div>`;
    }).join('');
}
