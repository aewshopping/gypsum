import { appState } from '../../services/store.js';
import { renderFilename, renderOpenFileLink } from '../ui-functions-render/render-filename.js';
import { renderTags } from '../ui-functions-render/render-tags.js';
import { checkFileOnPage } from '../pagination/check-file-on-page.js';

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

                // Format cell content based on data type
                switch (prop.type) {
                    case 'string':
                        if (prop.name === 'internalId') {
                            cellContent = renderOpenFileLink(file.internalId, file.color);
                        } else if (prop.name === 'filename') {
                            cellContent = renderFilename(file.filepath || ''); // the full path from the root, now that folders are loaded
                        } else {
                            cellContent = value || '';
                        }
                        break;
                    case 'date':
                        cellContent = value ? new Date(value).toLocaleDateString() : 'N/A';
                        break;
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
                        cellContent = value || '';
                        break;
                }
                // The file column takes the file's colour faded the way the content modal fades it,
                // so the link keeps its contrast against whatever colour the user picked. The row
                // itself carries the colour undiluted, which link text could not be read on.
                const fade = prop.name === 'internalId' ? ' color-dynamic-fade' : '';
                return `<div class="note-table-cell keyboard-navigable${fade}" data-action="expand-cell" tabindex="0" data-index="${index}" data-prop="${prop.name}" data-color="${file.color}">${cellContent}</div>`;
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
