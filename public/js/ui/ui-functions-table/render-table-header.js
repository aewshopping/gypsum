import { appState, FILE_PROPERTIES } from '../../services/store.js';

/**
 * Renders the header for the table view.
 * Dynamically creates column headers based on specified properties
 * and injects CSS for column widths.
 * @returns {string} The HTML string for the table header.
 */
export function renderTableHeader(columnsToShow) {

    // Generate the header cell HTML
    const headerCellsHtml = columnsToShow
        .map(propName => `<div class="note-table-cell-header flex-row">${propName}<span class="flexgrow"> </span><span data-property="${propName}" data-action="sort-object" class="sort-by-prop-trigger">˅</span></div>`)
        .join('');

    // Generate the grid-template-columns value for the CSS
    const columnWidths = columnsToShow
        .map(propName => {
            const width = FILE_PROPERTIES[propName]?.column_width;
            return width ? `${width}px` : '100px'; // Default to '100px' if width is not defined, noting 'auto' doesn't work!
        })
        .join(' ');

    document.body.style.setProperty('--grid-columns', columnWidths); // because css for table is grid-template-columns: var(--grid-columns)

    // Return the complete header HTML
    return `<div class="note-table-header">${headerCellsHtml}</div>`;
}
