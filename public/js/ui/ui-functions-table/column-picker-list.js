import { appState, TABLE_VIEW_COLUMNS, FILE_PROPERTIES } from '../../services/store.js';

/**
 * Renders the column picker's rows: one per property the loaded files carry, ticked when that
 * property is currently a table column.
 *
 * The candidates come from myFilesProperties rather than FILE_PROPERTIES, because that is the
 * set of properties actually present in this folder — front matter keys included — which is what
 * makes the list change from folder to folder. hidden_always is excluded: those are app
 * internals with nothing to show.
 *
 * Rows sit in the table's own column order, using the same display_order comparator as
 * tableColumns(), so a row's position in this list matches its column's position in the table.
 *
 * The toggles carry no data-action and are deliberately inert. The grips drag (see
 * column-picker-reorder.js) but the order they produce is not stored either. Wiring both up is
 * plans/table-column-visibility.md.
 *
 * @returns {string} HTML string for #column-picker-list's innerHTML.
 */
export function renderColumnPickerList() {
    const hidden = new Set(TABLE_VIEW_COLUMNS.hidden_always);
    const visible = new Set(TABLE_VIEW_COLUMNS.current_props.map(prop => prop.name));

    const properties = [...appState.myFilesProperties.keys()].filter(prop => !hidden.has(prop));

    properties.sort((a, b) => {
        const orderA = FILE_PROPERTIES.get(a)?.display_order ?? 99;
        const orderB = FILE_PROPERTIES.get(b)?.display_order ?? 99;
        return orderA - orderB;
    });

    return properties.map(prop => {
        const label = FILE_PROPERTIES.get(prop)?.label ?? prop;
        const checked = visible.has(prop) ? ' checked' : '';

        return `<div class="modal-row">` +
                 `<button type="button" class="modal-row-btn modal-row-grip" data-tip="drag to reorder this column">` +
                   `<svg class="modal-row-icon"><use href="#icon-drag"></use></svg></button>` +
                 `<span class="modal-row-label">${label}</span>` +
                 `<input type="checkbox" class="toggle"${checked}>` +
               `</div>`;
    }).join('');
}
