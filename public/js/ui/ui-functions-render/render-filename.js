export function renderFilename(filename) {

return `<span class="copyhighlight">
    <i><span class="copyflag" 
            data-action="copy-filename" 
            title="copy filename to clipboard" 
            data-filename="${filename}">©</span>&nbsp;${filename}
    </i>
  </span>`;
}

export function renderFilenamePlusOpenBtn(filename, color) {

return `<span class="show-content-tag color-dynamic" data-color="${color}" data-filename="${filename}" data-action="open-file-content-modal">open</span><span class="copyhighlight"><i><span class="copyflag" 
            data-action="copy-filename"
            title="copy filename to clipboard" 
            data-filename="${filename}">©</span>&nbsp;${filename}
    </i>
  </span>`;
}