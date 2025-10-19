// This function replicates the details / summary approach where all text content is rendered immediately to the page. This option is intended to be superseded by a grid layout which then calls the file content and renders to a modal. 

import { appState } from '../../services/store.js';

export async function renderFileList_grid() {

    let file_html = ""

    for (const file of appState.myFiles) {
     //   console.log(file);

        // construct the html for the array of tags for this file
        let tag_pills_html = ""
        for (const tag of file.tags) {
            tag_pills_html += `
                <code>
                    <span class="tag ${tag}" data-action="tag-filter">${tag}</span>
                </code>
            `
        }

        // construct the html for the file as a whole, pulling in file content and tag pills from above. note still need to implement data-color functionality
        const tag_list = file.tags.join(" ");
        file_html += `
        <div class="note-grid ${tag_list}" data-color="${file.color}" data-filename="${file.filename}" data-action="open-file-content-modal">

            <span class="copyhighlight">

                <i><span class="copyflag" data-action="copy-filename" title="copy filename to clipboard" data-filename=${file.filename}>©</span>&nbsp;${file.filename}</i>

                </span>

            <p>${file.title}</p>

            ${tag_pills_html}

        </div>
        `
    }

    document.getElementById('output').innerHTML = file_html;

}