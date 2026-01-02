import { appState, FILE_PROPERTIES, TABLE_VIEW_COLUMNS } from '../../services/store.js';

/**
 * Renders the header for the table view.
 * Dynamically creates column headers based on specified properties
 * and injects CSS for column widths.
 * @returns {string} The HTML string for the table header.
 */
export function renderTableHeader() {
    // Dynamically determine columns to show from myFilesProperties
    const hiddenColumns = new Set([...TABLE_VIEW_COLUMNS.hidden_always, ...TABLE_VIEW_COLUMNS.hidden_at_start]);
    const columnsToShow = [...appState.myFilesProperties.keys()].filter(prop => !hiddenColumns.has(prop));

console.log(appState.myFilesProperties);

    // Sort columns based on the display_order defined in FILE_PROPERTIES
    columnsToShow.sort((a, b) => {
        const orderA = FILE_PROPERTIES[a]?.display_order ?? 99;
        const orderB = FILE_PROPERTIES[b]?.display_order ?? 99;
        return orderA - orderB;
    });

    // Generate the header cell HTML
    const headerCellsHtml = columnsToShow
        .map(propName => `<div class="note-table-cell">${propName}</div>`)
        .join('');

    // Generate the grid-template-columns value for the CSS
    const columnWidths = columnsToShow
        .map(propName => {
            const width = FILE_PROPERTIES[propName]?.column_width;
            return width ? `${width}px` : '100px'; // Default to '100px' if width is not defined, noting 'auto' doesn't work!
        })
        .join(' ');

    // Create a style element to dynamically set the column widths
    const styleId = 'dynamic-table-styles';
    let styleElement = document.getElementById(styleId);
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
    }

    // Set the CSS rule for the .list-table class
    styleElement.innerHTML = `
        .list-table {
            grid-template-columns: ${columnWidths};
        }
    `;

    // Return the complete header HTML
    return `<div class="note-table-header">${headerCellsHtml}</div>`;
}
