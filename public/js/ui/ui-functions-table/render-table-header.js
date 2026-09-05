/**
 * Renders the header strip for the table view.
 * Dynamically creates column headers based on specified properties
 * and injects CSS for column widths.
 *
 * The header is NOT a child of .list-table. It sits above the scroll container so it
 * can stick to the viewport: a sticky element resolves against its nearest scroll
 * container, so a header inside .list-table would stick to the table rather than the
 * page. It re-declares the same --grid-columns tracks instead of using subgrid, and is
 * kept horizontally in step with the body by note-table.css (see --table-h-scroll).
 *
 * @param {Array<object>} current_props - The properties to render as column headers.
 * @returns {string} The HTML string for the table header strip.
 */
export function renderTableHeader(current_props) {

    // Generate the header cell HTML
    const headerCellsHtml = current_props
        .map(prop => `<div class="note-table-cell-header flex-row">${prop.name}<span class="flexgrow"> </span><span data-property="${prop.name}" data-action="sort-object" class="sort-by-prop-trigger" data-tip="sort by ${prop.name}">˅</span></div>`)
        .join('');

    // Generate the grid-template-columns value for the CSS
    const columnWidths = current_props
        .map(prop => {
            const width = prop.column_width;
            return width ? `${width}px` : '100px'; // Default to '100px' if width is not defined, noting 'auto' doesn't work!
        })
        .join(' ');

    document.body.style.setProperty('--grid-columns', columnWidths); // because css for table is grid-template-columns: var(--grid-columns)

    // The strip clips the header horizontally; the header itself is full track width.
    return `<div class="note-table-header-strip"><div class="note-table-header">${headerCellsHtml}</div></div>`;
}
