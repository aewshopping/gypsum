import { appState, FILE_PROPERTIES } from '../../services/store.js';
import { renderFilenamePlusOpenBtn } from '../ui-functions-render/render-filename.js';
import { renderTags } from '../ui-functions-render/render-tags.js';

/**
 * Renders the rows for the table view.
 * Iterates through the files in the appState and generates the HTML for each row.
 * @returns {string} The HTML string for all table rows.
 */
export function renderTableRows(columnsToShow) {
    let rowsHtml = '';

    // Pre-fetch column properties to avoid repeated lookups in the loop
    const columnProperties = columnsToShow.map(propName => ({
        name: propName,
        ...FILE_PROPERTIES[propName]
    }));

    for (const file of appState.myFiles) {
        if (file.show === true) {

            const cellsHtml = columnProperties.map(prop => {
                const value = file[prop.name];
                let cellContent = '';

                // Format cell content based on data type
                switch (prop.type) {
                    case 'string':
                        if (prop.name === 'filename') {
                            cellContent = renderFilenamePlusOpenBtn(value || '', file.color); // so that it shows the "copy filename" thing
                        } else {
                            cellContent = value || '';
                        }
                        break;
                    case 'date':
                        cellContent = value ? new Date(value).toLocaleDateString() : 'N/A';
                        break;
                    case 'array':
                        if (Array.isArray(value)) {
                            if (prop.name === 'tags') {
                                cellContent = value.map(tag => renderTags(tag)).join(''); // to make the tags clickable filters
                            } else {
                                cellContent = value.join(', ');
                            }
                        }
                        break;
                    case 'number':
                        cellContent = value?.toString() ?? '';
                        break;
                    default:
                        cellContent = value || '';
                        break;
                }
                return `<div class="note-table-cell">${cellContent}</div>`;
            }).join('');

            // this is the "wrapper" div that contains the table row elements rendered above
            const tagList = file.tags ? file.tags.join(" ") : "";
            rowsHtml += `
                <div class="note-table ${tagList} color-dynamic-transparent-fallback" data-color="${file.color}" tabindex="0">
                    ${cellsHtml}
                </div>
            `;
        }
    }

    return rowsHtml;
}
