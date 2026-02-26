/**
 * Renders a filename with a copy-to-clipboard button.
 * @function renderFilename
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
 * @function renderFilenamePlusOpenBtn
 * @param {string} filename - The filename to render.
 * @param {string} color - The color associated with the file.
 * @returns {string} The HTML string for the rendered filename and buttons.
 */
export function renderFilenamePlusOpenBtn(filename, color) {

return `<span class="show-content-tag color-dynamic" data-color="${color}" data-filename="${filename}" data-action="open-file-content-modal">open</span><span class="copyhighlight"><i><span class="copyflag" 
            data-action="copy-filename"
            title="copy filename to clipboard" 
            data-filename="${filename}">©</span>&nbsp;${filename}
    </i>
  </span>`;
}