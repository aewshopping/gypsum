/**
 * @file This file is responsible for rendering the file list in a grid view.
 */

import { appState } from '../services/store.js';
import { renderFilename } from './ui-functions-render/render-filename.js';
import { renderTags } from './ui-functions-render/render-tags.js';
import { checkFilesToShow } from './ui-functions-search/a-check-files-to-show.js';

/**
 * Renders the list of files as a grid of cards.
 * Each card displays the file's title, filename, and tags.
 * The function iterates through the files in the `appState`, creates an HTML string for each file,
 * and then sets the innerHTML of the 'output' element to the generated string.
 */
export function renderFileList_grid(renderEverything) {

    // set the header card
    let file_html = `
        <div class="list-grid">

            <div class="note-grid-header">

                <div><i>filename</i></div>
                <p>file title</p>
                <code>file tags</code>

            </div>`


    for (const file of appState.myFiles) {

        if (checkFilesToShow(file.id) === true || renderEverything===true ) {
     //   console.log(file);

        // construct the html for the array of tags for this file
        let tag_pills_html = ""
        for (const tag of file.tags) {
            tag_pills_html += renderTags(tag);
        }

        // construct the html for the file as a whole, pulling in file content and tag pills from above.
  //      const tag_list = file.tags.join(" ");
        const filename_html = renderFilename(file.filename);
        file_html += `
        <div class="note-grid color-dynamic" data-color="${file.color}" data-filename="${file.filename}" data-action="open-file-content-modal">

            <div data-prop="filename">${filename_html}</div>

            <p data-prop="title">${file.title}</p>

            <div data-prop="tags">${tag_pills_html}</div>

        </div>
        `
       }
    }

    file_html += "</div>" // closing the list-grid div

    document.getElementById('output').innerHTML = file_html;

}