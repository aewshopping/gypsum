import { appState, TABLE_VIEW_COLUMNS } from '../../services/store.js';
import { VALUE_TYPES, SEARCH_TYPES, labelFor } from '../../constants.js';
import { isPropertyEditable, propertyType, propertySearchType } from '../../services/property-type.js';
import { typeGlyph } from '../ui-functions-render/type-glyph.js';
import { escapeHtml } from '../ui-functions-render/escape-html.js';

/**
 * @file The rows of the types modal: one per property the user's own notes carry.
 *
 * A sibling of column-picker-list.js rather than a branch inside it. That renderer draws a grip, a
 * toggle, a bin and three kinds of locked row, and none of them belongs here — a list where every
 * row is editable by construction would be that renderer with most of it guarded off. What the two
 * do share is the part that matters: the same row classes, the same glyph builder and the same
 * data-action, so a row here and a row in the picker are the same control and open the same dialog.
 */

/**
 * The properties the types modal is about: the keys the loaded folder's notes actually carry, less
 * the ones the app fills in itself.
 *
 * myFilesProperties rather than the column layout, because a type belongs to the property and not
 * to any arrangement of columns — a property hidden from the table still sorts and searches, so its
 * type is still worth setting. It also leaves out a "dead" property a saved layout remembers but the
 * folder no longer has, which the picker does offer: there the point is to be rid of the column,
 * and here it would be a row about a property the user's files do not have.
 *
 * isPropertyEditable is the same question the picker asks before offering its glyph button, so the
 * two cannot disagree about which properties have a type the user owns.
 *
 * Map insertion order is the order properties were registered in, which is what the sort dropdown
 * already lists them in.
 *
 * @returns {string[]} The property keys, in registration order.
 */
export function userTypeProperties() {
    return [...appState.myFilesProperties.keys()].filter(isPropertyEditable);
}

/**
 * Renders the types modal's rows.
 *
 * The label is read the way openColumnTypeDialog reads it for its own heading, so a renamed column
 * is named the same in the row and in the dialog the row opens. It falls back to the property's own
 * key, which is what it is before a table has ever been rendered.
 *
 * The row carries the resolved type and search type, because that is what the type dialog writes a
 * choice onto and what its commit reads back — exactly as a picker row does.
 *
 * No disabled branch and no locked glyph: userTypeProperties has already excluded every property
 * whose type is the app's.
 *
 * @returns {string} HTML string for #property-types-list's innerHTML.
 */
export function renderPropertyTypesList() {
    return userTypeProperties().map(name => {
        const label = TABLE_VIEW_COLUMNS.columnLayout.get(name)?.label ?? name;
        const type = propertyType(name);
        const searchType = propertySearchType(name);

        const typeLabel = labelFor(VALUE_TYPES, type);
        const tip = type === VALUE_TYPES.ARRAY.value
            ? `${typeLabel}, ${labelFor(SEARCH_TYPES, searchType)}`
            : typeLabel;

        return `<div class="info-modal-row" data-property="${escapeHtml(name)}"` +
                 ` data-type="${type}" data-search-type="${searchType}">` +
                 `<span class="info-modal-row-label">${escapeHtml(label)}</span>` +
                 `<span class="column-picker-actions">` +
                   `<button type="button" class="info-modal-row-btn column-picker-type" data-action="column-type-open" data-tip="${tip}">` +
                     typeGlyph({ name, type }, 'info-modal-row-icon') + `</button>` +
                 `</span>` +
               `</div>`;
    }).join('');
}
