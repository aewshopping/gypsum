import { appState } from '../services/store.js';
import { renderFilename } from './ui-functions-render/render-filename.js';
import { renderTags } from './ui-functions-render/render-tags.js';

export async function renderFileList_list() {
    let file_html = `<ol class="list-view">`; 

    for (const file of appState.myFiles) {
        if (file.show === true) {
            const filename_html = renderFilename(file.filename);

            // construct the html for the array of tags for this file
            let tag_pills_html = ""
            for (const tag of file.tags) {
                tag_pills_html += renderTags(tag);
            }

            file_html += `
                <li>
                    <details>
                        <summary>${filename_html} ${tag_pills_html}</summary>
                        <ul>
                        <li><span class="list-file-open color-dynamic" data-color="${file.color}" data-filename="${file.filename}" data-action="open-file-content-modal">show content</span></li>
                        `;
            for (const key in file) {
                const value = file[key];
                // Skip properties that we don't want to display
                if (key === 'handle' || key === 'show') continue;

                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    file_html += `<li><strong>${key}:</strong><ul>`;
                    for (const subKey in value) {
                        file_html += `<li><strong>${subKey}:</strong> ${value[subKey]}</li>`;
                    }
                    file_html += `</ul></li>`;
                } else {
                    file_html += `<li><strong>${key}:</strong> ${value}</li>`;
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
