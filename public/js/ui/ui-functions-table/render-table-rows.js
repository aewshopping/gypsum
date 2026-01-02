import { appState, FILE_PROPERTIES, TABLE_VIEW_COLUMNS } from '../../services/store.js';
import { renderFilename } from '../ui-functions-render/render-filename.js';
import { renderTags } from '../ui-functions-render/render-tags.js';

/**
 * Renders the rows for the table view.
 * Iterates through the files in the appState and generates the HTML for each row.
 * @returns {string} The HTML string for all table rows.
 */
export function renderTableRows() {
    let rowsHtml = '';

    // Get the columns to display and sort them
    const columnsToShow = [...TABLE_VIEW_COLUMNS.default];
    columnsToShow.sort((a, b) => {
        const orderA = FILE_PROPERTIES[a]?.display_order ?? 99;
        const orderB = FILE_PROPERTIES[b]?.display_order ?? 99;
        return orderA - orderB;
    });

    for (const file of appState.myFiles) {
        if (file.show === true) {
            const cellsHtml = columnsToShow.map(propName => {
                const property = FILE_PROPERTIES[propName];
                const value = file[propName];
                let cellContent = '';

                // Format cell content based on data type
                switch (property?.type) {
                    case 'string':
                        if (propName === 'filename') {
                            cellContent = renderFilename(value || '');
                        } else {
                            cellContent = value || '';
                        }
                        break;
                    case 'date':
                        cellContent = value ? new Date(value).toLocaleDateString() : 'N/A';
                        break;
                    case 'array':
                        if (Array.isArray(value)) {
                             if (propName === 'tags') {
                                cellContent = value.map(tag => renderTags(tag)).join('');
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

            const tagList = file.tags ? file.tags.join(" ") : "";
            rowsHtml += `
                <div class="note-table ${tagList} color-dynamic" data-color="${file.color}" data-filename="${file.filename}" data-action="open-file-content-modal">
                    ${cellsHtml}
                </div>
            `;
        }
    }

    return rowsHtml;
}
