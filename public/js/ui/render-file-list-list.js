/**
 * @file This file is responsible for rendering the file list in a list view.
 */

import { appState } from '../services/store.js';
import { renderFilename } from './ui-functions-render/render-filename.js';
import { renderTags } from './ui-functions-render/render-tags.js';
import { checkFilesToShow } from './ui-functions-search/a-check-files-to-show.js';

/**
 * Renders the list of files as an ordered list.
 * Each list item is a `<details>` element, with the filename and tags in the `<summary>`.
 * The content of the `<details>` element is a nested list of the file's properties.
 * This function iterates through the files in the `appState`, creates an HTML string for each file,
 * and then sets the innerHTML of the 'output' element to the generated string.
 */
export function renderFileList_list(renderEverything) {
    let file_html = `<ol class="list-view">`; 

    for (const file of appState.myFiles) {
        if (checkFilesToShow(file.id) === true || renderEverything === true ) {

            const filename_html = renderFilename(file.filename);

            // construct the html for the array of tags for this file
            let tag_pills_html = ""
            for (const tag of file.tags) {
                tag_pills_html += renderTags(tag);
            }

            file_html += `
                <li>
                    <details>
                        <summary data-prop="filename">${filename_html} ${tag_pills_html}</summary>
                        <ul>
                        <li><span class="show-content-tag color-dynamic" data-color="${file.color}" data-filename="${file.filename}" data-action="open-file-content-modal">open</span></li>
                        `;
            for (const key in file) {
                const value = file[key];
                // Skip properties that we don't want to display
                if (key === 'handle' || key === 'show' ) continue;

                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    file_html += `<li><strong>${key}:</strong><ul>`;
                    for (const subKey in value) {
                        file_html += `<li><strong>${subKey}:</strong> ${value[subKey]}</li>`;
                    }
                    file_html += `</ul></li>`;
                } else {
                    file_html += `<li><strong>${key}:</strong><span data-prop="${key}"> ${value}</span></li>`;
                }
            }
            file_html += `
                        </ul>
                    </details>
                </li>`;
        }
    }

    file_html += `</ol>`;
    document.getElementById('output').innerHTML = file_html;
}
