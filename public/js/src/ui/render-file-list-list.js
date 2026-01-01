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
