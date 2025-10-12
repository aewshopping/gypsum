// This function replicates the details / summary approach where all text content is rendered immediately to the page. This option is intended to be superseded by a grid layout which then calls the file content and renders to a modal. 

import { appState } from '../../services/store.js';
import { marked }  from '../../services/marked.eos.js';

export async function renderFileList_details() {

    let file_html = ""

    for (const file of appState.myFiles) {
     //   console.log(file);

       // get the file content and parse it with marked - this slows things down a lot doing it this way. Not going to improve it because am replacing render as per above
//        const file_handle = await file.handle.getFile();
//        const file_content = await file_handle.text();
        const file_content_rendered = "placeholder 🙂" // marked(file_content);

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
        <details class="note-details ${tag_list}">

            <summary data-color="">
            <span class="copyhighlight">

                <span class="copyflag" data-action="copy-filename" title="copy filename to clipboard" data-filename=${file.filename}>©</span>

                ${file.filename}

            </span>
            <br>

                ${tag_pills_html}

            </summary>

            ${file_content_rendered}

        </details>
        `
    }

    document.getElementById('output').innerHTML = file_html;

}