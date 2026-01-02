export function renderFilename(filename) {

return `<span class="copyhighlight">
    <i>
      <span class="copyflag" 
            data-action="copy-filename" 
            title="copy filename to clipboard" 
            data-filename="${filename}">©</span>&nbsp;${filename}
    </i>
  </span>`;

}