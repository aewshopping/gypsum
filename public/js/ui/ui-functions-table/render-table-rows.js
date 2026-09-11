import { appState } from '../../services/store.js';
import { VALUE_TYPES, labelFor } from '../../constants.js';
import { typeMismatch } from '../../services/property-type.js';
import { renderFilename, renderOpenFileLink } from '../ui-functions-render/render-filename.js';
import { renderTags } from '../ui-functions-render/render-tags.js';
import { checkFileOnPage } from '../pagination/check-file-on-page.js';

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
function mismatchMessage(mismatch, type) {
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
 * Renders the rows for the table view.
 * Iterates through the files in the appState and generates the HTML for each row.
 *
 * @param {Array<string>} current_props An array of the current properties being displayed.
 * @param {boolean} renderEverything Whether to render all files or only the ones that match the current filters.
 * @returns {string} The HTML string for all table rows.
 */
export function renderTableRows(current_props, renderEverything) {
    let rowsHtml = '';
    let index = 0;

    for (const file of appState.myFiles) {
        if (checkFileOnPage(file.internalId)) {

            const cellsHtml = current_props.map(prop => {
                index++;
                const value = file[prop.name];
                let cellContent = '';

                // A cell whose value cannot be drawn as its column's type shows its text and says
                // so, rather than being blanked or drawn wrongly. The marker is on the cell rather
                // than left for anyone to infer from the text, because a matching text cell and a
                // mismatched one look the same — and the editing work has to tell them apart.
                const mismatch = typeMismatch(value, prop.type);
                if (mismatch) {
                    cellContent = renderMismatch(value);
                }

                // Format cell content based on data type
                else switch (prop.type) {
                    case 'string':
                        if (prop.name === 'internalId') {
                            cellContent = renderOpenFileLink(file.internalId, file.color);
                        } else if (prop.name === 'filename') {
                            cellContent = renderFilename(file.filepath || ''); // the full path from the root, now that folders are loaded
                        } else {
                            cellContent = value ?? '';
                        }
                        break;
                    case 'date': {
                        // A column's type is the user's choice, so a date column can hold anything.
                        // Falling back to the raw text shows what the file says; the alternative is
                        // the string "Invalid Date", which is the app inventing a fact.
                        if (!value) { cellContent = 'N/A'; break; }
                        const asDate = new Date(value);
                        cellContent = isNaN(asDate) ? value : asDate.toLocaleDateString();
                        break;
                    }
                    case 'array':
                        if (value instanceof Map) {
                            cellContent = [...value.keys()].map(tag => renderTags(tag)).join(''); // to make the tags clickable filters
                        } else if (Array.isArray(value)) {
                            // Renders other arrays as an unordered list (<ul>)
                            const listItems = value.map(item => `<li>${item}</li>`).join('');
                            cellContent = `<ul class="table-view-array-list">${listItems}</ul>`;
                        }
                        break;
                    case 'number':
                        cellContent = value?.toString() ?? '';
                        break;
                    default:
                        // ?? rather than ||: a front matter key holding `false` or `0` is a value,
                        // and || threw both away as empty.
                        cellContent = value ?? '';
                        break;
                }
                // The file column takes the file's colour faded the way the content modal fades it,
                // so the link keeps its contrast against whatever colour the user picked. The row
                // itself carries the colour undiluted, which link text could not be read on.
                //
                // Only where there is a colour: .color-dynamic-fade falls back to a neutral of its
                // own, which on an uncoloured row painted this one cell a different shade from its
                // neighbours for no reason, and hid the row's hover behind an opaque background.
                const fade = prop.name === 'internalId' && file.color ? ' color-dynamic-fade' : '';
                // The tip carries the whole explanation, which is also what cell-expand.js shows
                // inside the cell when it is opened. One sentence, written in one place.
                const flag = mismatch
                    ? ` data-mismatch="${mismatch}" data-tip="${mismatchMessage(mismatch, prop.type)}"`
                    : '';
                return `<div class="note-table-cell keyboard-navigable${fade}" data-action="expand-cell" tabindex="0" data-index="${index}" data-prop="${prop.name}" data-color="${file.color}"${flag}>${cellContent}</div>`;
            }).join('');

            // this is the "wrapper" div that contains the table row elements rendered above
            const tagList = file.tags instanceof Map ? [...file.tags.keys()].join(" ") : "";
            rowsHtml += `
                <div class="note-table ${tagList} color-dynamic-transparent-fallback" data-color="${file.color}" data-vt-id="${file.internalId}">
                    ${cellsHtml}
                </div>
            `;
        }
    }

    return rowsHtml;
}
