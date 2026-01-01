import { appState } from '../services/store.js';
import { renderFilename } from './ui-functions-render/render-filename.js';

export async function renderFileList_list() {
    let file_html = `<ol class="list-view">`;

    for (const file of appState.myFiles) {
        if (file.show === true) {
            const filename_html = renderFilename(file.filename);
            file_html += `
                <li>
                    <details>
                        <summary>${filename_html}</summary>
                        <ul>`;
            for (const key in file) {
                file_html += `<li><strong>${key}:</strong> ${file[key]}</li>`;
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
