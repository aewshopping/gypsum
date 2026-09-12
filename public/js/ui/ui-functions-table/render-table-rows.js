import { appState } from '../../services/store.js';
import { typeMismatch, isInfoColumn } from '../../services/property-type.js';
import { checkFileOnPage } from '../pagination/check-file-on-page.js';
import { renderCellValue, mismatchMessage } from './render-cell-value.js';

/**
 * Renders the rows for the table view.
 * Iterates through the files in the appState and generates the HTML for each row.
 *
 * What goes inside a cell is render-cell-value.js's job. This builds the row around it.
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

                // A cell whose value cannot be drawn as its column's type shows its text and says
                // so, rather than being blanked or drawn wrongly. The marker is on the cell rather
                // than left for anyone to infer from the text, because a matching text cell and a
                // mismatched one look the same — and the editing work has to tell them apart.
                const mismatch = typeMismatch(file[prop.name], prop.type);
                const cellContent = renderCellValue(prop, file, mismatch);

                // The file column takes the file's colour faded the way the content modal fades it,
                // so the link keeps its contrast against whatever colour the user picked. The row
                // itself carries the colour undiluted, which link text could not be read on.
                //
                // Only where there is a colour: .color-dynamic-fade falls back to a neutral of its
                // own, which on an uncoloured row painted this one cell a different shade from its
                // neighbours for no reason, and hid the row's hover behind an opaque background.
                const fade = prop.name === 'internalId' && file.color ? ' color-dynamic-fade' : '';

                // The app fills this column in, so its cells take no caret. Marked on the cell rather
                // than looked up again when one is opened, for the same reason data-mismatch is:
                // cell-editor.js reads the cell, not the schema.
                const info = isInfoColumn(prop.name) ? ' data-info' : '';

                // The tip carries the whole explanation, which is also what cell-editor.js shows
                // inside the cell when it is opened. One sentence, written in one place.
                const flag = mismatch
                    ? ` data-mismatch="${mismatch}" data-tip="${mismatchMessage(mismatch, prop.type)}"`
                    : '';
                return `<div class="note-table-cell keyboard-navigable${fade}" data-action="expand-cell" tabindex="0" data-index="${index}" data-prop="${prop.name}" data-color="${file.color}"${info}${flag}>${cellContent}</div>`;
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
