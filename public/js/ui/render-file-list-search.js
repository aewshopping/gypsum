
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
                <div class="search-view-item color-dynamic" data-color="${file.color}" data-filename="${file.filename}" data-action="open-file-content-modal">

                    <div class="search-view-fileinfo">
                        <div class="note-search" data-color="${file.color}">
                            <div>${filename_html}</div>
                            <p>${file.title}</p>
                            <div>${tag_pills_html}</div>
                        </div>
                    </div>`;

            const matchingFilters = appState.search.matchingFiles.get(file.id);

            console.log(matchingFilters);

            file_html += `
                    <div class="search-view-matches flex-column color-dynamic" data-color="${file.color}">`
            if (matchingFilters) {
                for (const [filterId, resultsObj] of matchingFilters) {
                    let matchHtml = "";
                    let contentInfo = "";

                    if (resultsObj.property_match === "content") {
                        const matches = resultsObj.matches;
                        const match_count = resultsObj.count;
                        const snippet_count = resultsObj.matches.length;

                        contentInfo = `<span><i>(showing ${snippet_count} of ${match_count} matches)</i></span>`

                        console.log(resultsObj);
                        for (const match of matches) {
                            matchHtml += `<pre class="snippet color-dynamic-fade" data-color="${file.color}" data-prop="content">...${match.snippet}...</pre>`;
                        }
                        console.log(matchHtml);
                    }

                        file_html +=
                            `<div class="search-view-matches-item color-dynamic" data-color="${file.color}">
                            <p>
                                <i>${resultsObj.property_match}</i>:<span data-prop="${resultsObj.property_match}"> ${resultsObj.searchValue}</span> ${contentInfo}
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
