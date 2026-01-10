/**
 * Renders an HTML string for a filename, including a copy-to-clipboard icon.
 * @param {string} filename The filename to be rendered.
 * @returns {string} The generated HTML string.
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
 * Renders an HTML string for a filename that includes both an 'open' button
 * to view the file content and a copy-to-clipboard icon.
 * @param {string} filename The filename to be rendered.
 * @param {string} color A color value to be applied to the 'open' button for dynamic styling.
 * @returns {string} The generated HTML string.
 */
export function renderFilenamePlusOpenBtn(filename, color) {

return `<span class="show-content-tag color-dynamic" data-color="${color}" data-filename="${filename}" data-action="open-file-content-modal">open</span><span class="copyhighlight"><i><span class="copyflag" 
            data-action="copy-filename"
            title="copy filename to clipboard" 
            data-filename="${filename}">©</span>&nbsp;${filename}
    </i>
  </span>`;
}