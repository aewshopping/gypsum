import { VALUE_TYPES, labelFor } from '../../constants.js';
import { isInfoColumn } from '../../services/property-type.js';
import { renderFilename, renderOpenFileLink } from '../ui-functions-render/render-filename.js';
import { renderTags } from '../ui-functions-render/render-tags.js';
import { escapeHtml } from '../ui-functions-render/escape-html.js';
import { joinFlowItems } from '../../services/file-parsing/flow-list.js';

/**
 * @file What goes inside one table cell, given its column's type.
 *
 * Split out of render-table-rows.js, which was building a row and formatting a value in the same
 * breath. They are separate jobs and this is the one that grows: every decision about what a type
 * looks like lands here, and two of them only make sense beside each other — see
 * plans/completed/table-cell-editors.md §3.4 and §4.2.
 *
 * **Everything from a file is escaped on the way out**, because a cell is what an edit is read back
 * out of. The three renderers that mean their markup — renderFilename, renderOpenFileLink,
 * renderTags — belong to columns that refuse a caret, so nothing editable ever holds HTML.
 */

/**
 * What to tell someone about a cell whose value does not fit its column.
 *
 * Says which of the two things is wrong and where to fix it, because they have different answers: a
 * shape that the column cannot hold is the column's type being wrong, and text that cannot be read
 * is the note being wrong.
 *
 * Written once, onto the cell's tooltip, and shown a second time inside the cell when it is opened
 * — a tooltip needs a pointer, and half the people using this have a finger.
 *
 * @param {'shape'|'unreadable'} mismatch
 * @param {string} type - The column's type.
 * @returns {string}
 */
export function mismatchMessage(mismatch, type) {
    const typeLabel = labelFor(VALUE_TYPES, type);

    if (mismatch === 'unreadable') {
        return `not a ${typeLabel} — fix this in the note`;
    }
    return type === VALUE_TYPES.ARRAY.value
        ? 'not a list — change this column\'s type'
        : `a list, not a ${typeLabel} — change this column's type`;
}

/**
 * A value that does not fit its column, as text.
 *
 * A type is the user's choice, so any column can end up holding anything. Showing the file's own
 * words is what lets someone see what is there and work out which type it wanted — which is the
 * one thing a blank cell, or the string "[object Map]", takes away.
 *
 * A Map is the tag map, whose keys are the tags; an array is its items. Both read as their contents
 * rather than as what JavaScript would print for them.
 *
 * @param {*} value
 * @returns {string}
 */
function renderMismatch(value) {
    if (value instanceof Map) return [...value.keys()].join(', ');
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
}

/**
 * The HTML for one cell's content.
 *
 * @param {object} prop - The column, carrying `name` and the `type` propertyType() gave it.
 * @param {object} file - The file object the row is for.
 * @param {'shape'|'unreadable'|null} mismatch - What typeMismatch() said about this value.
 * @returns {string} The cell's inner HTML.
 */
export function renderCellValue(prop, file, mismatch) {
    const value = file[prop.name];

    // A cell whose value cannot be drawn as its column's type shows its text and says so, rather
    // than being blanked or drawn wrongly. The caller marks the cell; this just draws the text.
    if (mismatch) return escapeHtml(renderMismatch(value));

    switch (prop.type) {
        case VALUE_TYPES.STRING.value:
            if (prop.name === 'internalId') return renderOpenFileLink(file.internalId, file.color);
            // the full path from the root, now that folders are loaded
            if (prop.name === 'filename') return renderFilename(file.filepath || '');
            return escapeHtml(String(value ?? ''));

        case VALUE_TYPES.DATE.value:
            return renderDate(prop.name, value);

        case VALUE_TYPES.ARRAY.value:
            // The tag map is the only Map that reaches here, and its keys are clickable filters.
            if (value instanceof Map) {
                return [...value.keys()].map(tag => renderTags(tag)).join('');
            }
            // One comma-joined line rather than a <ul>, so a cell shows the same text it is edited
            // as — and a clipped one-line cell shows three items where bullets showed one. See
            // plans/completed/table-cell-editors.md §3.
            return Array.isArray(value) ? escapeHtml(joinFlowItems(value)) : '';

        case VALUE_TYPES.NUMBER.value:
            return escapeHtml(value?.toString() ?? '');

        default:
            // ?? rather than ||: a front matter key holding `false` or `0` is a value, and || threw
            // both away as empty.
            return escapeHtml(String(value ?? ''));
    }
}

/**
 * A date cell's text, which is the file's own words for every column but the app's own.
 *
 * **A note's date shows exactly what the note says.** The alternative was toLocaleDateString(),
 * which renders 2026-03-01 as 01/03/2026 for a UK reader — and new Date("01/03/2026") is the third
 * of January. Editing what that rendered would have moved dates by months. See
 * plans/completed/table-cell-editors.md §4.2.
 *
 * **An info date keeps its formatting**, because the app owns that value: lastModified is a Date
 * object with no note text behind it, printing raw as "Sun Mar 01 2026 00:00:00 GMT+0000 (…)", and
 * its cell takes no caret for anyone to edit.
 *
 * @param {string} name - The file property key.
 * @param {*} value
 * @returns {string}
 */
function renderDate(name, value) {
    if (!value) return '';

    if (isInfoColumn(name)) {
        const asDate = new Date(value);
        return escapeHtml(isNaN(asDate) ? String(value) : asDate.toLocaleDateString());
    }

    return escapeHtml(String(value));
}
