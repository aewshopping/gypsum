import { appState } from '../services/store.js';
import { renderFilename } from './ui-functions-render/render-filename.js';
import { renderTags } from './ui-functions-render/render-tags.js';
import { arrTableViewHide } from '../constants.js';
import { reOrderMap } from './ui-functions-render/reorder-fileprops.js';


export async function renderFileList_table() {


    // delete the "items to delete" in the constant array from the Set of columns
    arrTableViewHide.forEach(item => {
    appState.myFilesProperties.delete(item);
    });

    // Convert map to array, reorder by "order" then update the map with this order
    reOrderMap();


    // set the header row...
    let file_html = `
            <div class="note-table">

            <div class="note-table-cell">filename</div>

            <div class="note-table-cell">title</div>

            <div class="note-table-cell">tags</div>

        </div>
    `

    for (const file of appState.myFiles) {
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
        <div class="note-table ${tag_list} color-dynamic" data-color="${file.color}" data-filename="${file.filename}" data-action="open-file-content-modal">

            <div class="note-table-cell">${filename_html}</div>

            <div class="note-table-cell">${file.title}</div>

            <div class="note-table-cell">${tag_pills_html}</div>

        </div>
        `
    }

    document.getElementById('output').innerHTML = file_html;

}