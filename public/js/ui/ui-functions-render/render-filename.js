/**
 * Renders a filename.
 * @param {string} filename - The filename to render.
 * @returns {string} The HTML string for the rendered filename.
 */
export function renderFilename(filename) {
    return `<i>${filename}</i>`;
}

/**
 * Renders the table's "file" column: a link that opens the file.
 *
 * A plain <a> rather than an .internal-link, so links.css hangs its open glyph after the text —
 * the same marker the file history modal uses for "open this file", and the reason this is a
 * link at all rather than the button it replaced. target="_self" keeps it from honouring the
 * document's <base target="_blank">, and the click handler preventDefaults, so the href="#" is
 * never followed.
 *
 * data-color is not decoration: handleOpenFileContent reads it off whatever was clicked, so the
 * content modal takes the file's colour from here. Without it the modal opens colourless.
 *
 * @param {string} fileId - The file's unique id (full path from root); the click target.
 * @param {string} color - The file's colour, handed on to the modal that opens.
 * @returns {string} The HTML string for the link.
 */
export function renderOpenFileLink(fileId, color) {
    return `<a href="#" target="_self" data-file-id="${fileId}" data-color="${color}" data-action="open-file-content-modal" data-tip="open file">open</a>`;
}