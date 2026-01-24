
import { appState } from '../services/store.js';
import { checkFilesToShow } from './ui-functions-search/a-check-files-to-show.js';

/**
 * Renders the file list as a search result.
 * @param {boolean} renderEverything - a flag to render all files or only the filtered ones.
 */
export function renderFileList_search(renderEverything) {
    const outputElement = document.getElementById("output");
    outputElement.innerHTML = ''; // clear the output element first

    let file_html = `<div class="search-results-view">`;

    for (const file of appState.myFiles) {
        if (checkFilesToShow(file.id) === true || renderEverything === true) {
            file_html += `
                <div class="search-result-item">
                    <h3>${file.filename}</h3>
                    <p>${file.title}</p>
                    <ul>`;

            const matchingFilters = appState.search.matchingFiles.get(file.id);
            if (matchingFilters) {
                for (const [filterId, resultsObj] of matchingFilters) {
                    const filter = appState.search.filters.get(filterId);
                    if (filter) {
                        file_html += `<li><strong>${filter.property}:</strong> ${filter.value}</li>`;
                    }
                }
            }

            file_html += `
                    </ul>
                </div>`;
        }
    }

    file_html += `</div>`;
    outputElement.innerHTML = file_html;
}
