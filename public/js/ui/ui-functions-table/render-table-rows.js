import { appState } from '../../services/store.js';
import { typeMismatch, isInfoColumn, isPropertyEditable } from '../../services/property-type.js';
import { hasYamlError } from '../../services/file-parsing/file-errors.js';
import { checkFileOnPage } from '../pagination/check-file-on-page.js';
import { renderCellValue, mismatchMessage, rendersAsList } from './render-cell-value.js';

// Said to whoever opens a cell of a note whose front matter did not read cleanly. Every value in
// that block is a guess, so the fix is the note rather than anything the table can offer.
const YAML_ERROR_TIP = 'this note\'s front matter could not be read — fix it in the note';

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

                // A note whose front matter did not read cleanly has the cells that come from it
                // locked until it is fixed in the note — writing into a broken block writes into a
                // key nobody created. Only the cells that would otherwise take a caret are marked,
                // so a column that is locked anyway says nothing new about it. The sentence gives
                // way to a mismatch's below, which is the more specific thing to say about this one
                // cell — and both send you to the same note.
                const brokenYaml = isPropertyEditable(prop.name) && hasYamlError(file)
                    ? ` data-yaml-error${mismatch ? '' : ` data-tip="${YAML_ERROR_TIP}"`}`
                    : '';

                // Marks the cells whose items list-highlight.js bands after the render. On the cell
                // for the same reason data-info is: the renderer knows, and asking again later is
                // how the mark and the text end up disagreeing.
                const list = rendersAsList(prop, file, mismatch) ? ' data-list' : '';

                // The tip carries the whole explanation, which is also what cell-editor.js shows
                // inside the cell when it is opened. One sentence, written in one place.
                const flag = mismatch
                    ? ` data-mismatch="${mismatch}" data-tip="${mismatchMessage(mismatch, prop.type)}"`
                    : '';
                return `<div class="note-table-cell keyboard-navigable${fade}" data-action="expand-cell" tabindex="0" data-index="${index}" data-prop="${prop.name}" data-color="${file.color}"${info}${list}${brokenYaml}${flag}>${cellContent}</div>`;
            }).join('');

            // this is the "wrapper" div that contains the table row elements rendered above
            const tagList = file.tags instanceof Map ? [...file.tags.keys()].join(" ") : "";

            // Drawn from state rather than left on the element, so a row holding a move keeps its
            // outline through the renders that happen while it waits — another edit in the same
            // row, an autosave. pending-row-move.js puts the same class on directly for the render
            // that has already happened by the time it is asked.
            const pending = file.internalId === appState.pendingRowMove ? ' move-pending' : '';
            rowsHtml += `
                <div class="note-table ${tagList} color-dynamic-transparent-fallback${pending}" data-color="${file.color}" data-vt-id="${file.internalId}">
                    ${cellsHtml}
                </div>
            `;
        }
    }

    return rowsHtml;
}
