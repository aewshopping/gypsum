/**
 * Renders the header for the table view.
 * Dynamically creates column headers based on specified properties
 * and injects CSS for column widths.
 * @function renderTableHeader
 * @param {Array<object>} current_props - The properties to render as column headers.
 * @returns {string} The HTML string for the table header.
 */
export function renderTableHeader(current_props) {

    // Generate the header cell HTML
    const headerCellsHtml = current_props
        .map(prop => `<div class="note-table-cell-header flex-row">${prop.name}<span class="flexgrow"> </span><span data-property="${prop.name}" data-action="sort-object" class="sort-by-prop-trigger">˅</span></div>`)
        .join('');

    // Generate the grid-template-columns value for the CSS
    const columnWidths = current_props
        .map(prop => {
            const width = prop.column_width;
            return width ? `${width}px` : '100px'; // Default to '100px' if width is not defined, noting 'auto' doesn't work!
        })
        .join(' ');

    document.body.style.setProperty('--grid-columns', columnWidths); // because css for table is grid-template-columns: var(--grid-columns)

    // Return the complete header HTML
    return `<div class="note-table-header">${headerCellsHtml}</div>`;
}
