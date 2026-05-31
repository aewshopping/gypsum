/**
 * Renders a filename.
 * @param {string} filename - The filename to render.
 * @returns {string} The HTML string for the rendered filename.
 */
export function renderFilename(filename) {
    return `<i>${filename}</i>`;
}

/**
 * Renders a filename with an "open" button.
 * @param {string} filename - The filename to render.
 * @param {string} color - The color associated with the file.
 * @param {string} fileId - The file's unique id (full path from root); used to identify the click target.
 * @returns {string} The HTML string for the rendered filename and button.
 */
export function renderFilenamePlusOpenBtn(filename, color, fileId) {
    return `<span class="show-content-tag color-dynamic" data-color="${color}" data-file-id="${fileId}" data-action="open-file-content-modal">open</span><i>${filename}</i>`;
}