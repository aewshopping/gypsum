/**
 * Renders a filename with a copy-to-clipboard button.
 * @param {string} filename - The filename to render.
 * @returns {string} The HTML string for the rendered filename.
 */
export function renderFilename(filename) {

return `<span class="copyhighlight">
    <i><span class="copyflag" 
            data-action="copy-filename" 
            title="copy filename to clipboard" 
            data-filename="${filename}">©</span>&nbsp;${filename}
    </i>
  </span>`;
}

/**
 * Renders a filename with a copy-to-clipboard button and an "open" button.
 * @param {string} filename - The filename to render (display + clipboard payload).
 * @param {string} color - The color associated with the file.
 * @param {string} fileId - The file's unique id (full path from root); used to identify the click target.
 * @returns {string} The HTML string for the rendered filename and buttons.
 */
export function renderFilenamePlusOpenBtn(filename, color, fileId) {

return `<span class="show-content-tag color-dynamic" data-color="${color}" data-file-id="${fileId}" data-action="open-file-content-modal">open</span><span class="copyhighlight"><i><span class="copyflag"
            data-action="copy-filename"
            title="copy filename to clipboard"
            data-filename="${filename}">©</span>&nbsp;${filename}
    </i>
  </span>`;
}