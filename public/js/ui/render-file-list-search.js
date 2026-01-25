
import { appState } from '../services/store.js';
import { checkFilesToShow } from './ui-functions-search/a-check-files-to-show.js';
import { renderFilename } from './ui-functions-render/render-filename.js';
import { renderTags } from './ui-functions-render/render-tags.js';

/**
 * Renders the file list as a search result.
 * @param {boolean} renderEverything - a flag to render all files or only the filtered ones.
 */
export function renderFileList_search(renderEverything) {
    const outputElement = document.getElementById("output");
    //   outputElement.innerHTML = ''; // clear the output element first

    let file_html = `
            <div class="search-results-view">`;

    for (const file of appState.myFiles) {
        if (checkFilesToShow(file.id) === true || renderEverything === true) {

            const filename_html = renderFilename(file.filename);

            // construct the html for the array of tags for this file
            let tag_pills_html = ""
            for (const tag of file.tags) {
                tag_pills_html += renderTags(tag);
            }

            file_html += `
                <div class="search-view-item test-outline">

                    <div class="search-view-fileinfo">
                        <div data-prop="filename">${filename_html}</div>
                        <p data-prop="title">${file.title}</p>
                        <div data-prop="tags">${tag_pills_html}</div>
                    </div>`;

            const matchingFilters = appState.search.matchingFiles.get(file.id);

            console.log(matchingFilters);

            file_html += `
                    <div class="search-view-matches flex-column test-outline">`
            if (matchingFilters) {
                for (const [filterId, resultsObj] of matchingFilters) {
                    let matchHtml = "";

                    if (resultsObj.property_match === "content") {
                        const matches = resultsObj.matches;

                        console.log(resultsObj);
                        for (const match of matches) {
                            matchHtml += `<p data-prop="content">${match.snippet}</p>`;
                        }
                        console.log(matchHtml);
                    }

                        file_html +=
                            `<div class="search-view-matches-item">
                            <p>
                                <strong>${resultsObj.property_match}:</strong>
                                <span data-prop="${resultsObj.property_match}"> ${resultsObj.searchValue}</span>
                            </p>
                            ${matchHtml}
                        </div>`;
                    }
                }
                file_html += `
                    </div>
                </div>`; // close the item div
            }
        }

        file_html += `
            </div>`; // close the overall search view output div

        outputElement.innerHTML = file_html;
    }
