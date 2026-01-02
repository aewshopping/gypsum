// This function replicates the details / summary approach where all text content is rendered immediately to the page. This option is intended to be superseded by a grid layout which then calls the file content and renders to a modal. 

import { appState } from '../services/store.js';
import { renderFilename } from './ui-functions-render/render-filename.js';
import { renderTags } from './ui-functions-render/render-tags.js';

export async function renderFileList_grid() {

    // set the header card
    let file_html = `
        <div class="list-grid">

            <div class="note-grid-header">

                <div><i>filename</i></div>
                <p>file title</p>
                <code>file tags</code>

            </div>`


    for (const file of appState.myFiles) {
        if (file.show === true) {
     //   console.log(file);

        // construct the html for the array of tags for this file
        let tag_pills_html = ""
        for (const tag of file.tags) {
            tag_pills_html += renderTags(tag);
        }

        // construct the html for the file as a whole, pulling in file content and tag pills from above.
        const tag_list = file.tags.join(" ");
        const filename_html = renderFilename(file.filename);
        file_html += `
        <div class="note-grid ${tag_list} color-dynamic" data-color="${file.color}" data-filename="${file.filename}" data-action="open-file-content-modal">

            ${filename_html}

            <p>${file.title}</p>

            ${tag_pills_html}

        </div>
        `
       }
    }

    file_html += "</div>" // closing the list-grid div

    document.getElementById('output').innerHTML = file_html;

}