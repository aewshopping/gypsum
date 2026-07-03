
import { appState } from '../services/store.js';
import { checkFileOnPage } from './pagination/check-file-on-page.js';
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
        if (checkFileOnPage(file.id)) {

            const filename_html = renderFilename(file.filepath);

            // construct the html for the array of tags for this file
            let tag_pills_html = ""
            for (const tag of file.tags.keys()) {
                tag_pills_html += renderTags(tag);
            }

            file_html += `
                <div class="search-view-item color-dynamic" data-color="${file.color}" data-file-id="${file.id}" data-action="open-file-content-modal" data-vt-id="${file.id}" data-tip="open file">

                    <div class="search-view-fileinfo">
                        <div class="note-search" data-color="${file.color}">
                            <div>${filename_html}</div>
                            <p>${file.title}</p>
                            <div>${tag_pills_html}</div>
                        </div>
                    </div>`;

            const matchingFilters = appState.search.matchingFiles.get(file.id);

            //  console.log(matchingFilters);

            file_html += `
                    <div class="search-view-matches flex-column color-dynamic" data-color="${file.color}">`
            if (matchingFilters) {
                // Pre-pass: deduplicate by property, collecting all matched tag values
                // separately so every tag gets its own data-tag for highlighting.
                const seenProperties = new Map(); // property_match → first resultsObj
                const matchedTagValues = new Set();

                for (const [filterId, resultsObjArray] of matchingFilters) {
                    for (const resultsObj of resultsObjArray) {
                        const prop = resultsObj.property_match;
                        if (prop === 'tags') {
                            matchedTagValues.add(resultsObj.searchValue);
                            if (!seenProperties.has('tags')) seenProperties.set('tags', resultsObj);
                        } else if (!seenProperties.has(prop)) {
                            seenProperties.set(prop, resultsObj);
                        }
                    }
                }

                for (const [prop, resultsObj] of seenProperties) {
                    if (prop === 'content') {
                        const matches = resultsObj.matches;
                        const snippet_count = matches.length;
                        const contentInfo = `<span><i>(showing ${snippet_count} of ${resultsObj.count} matches)</i></span>`;
                        let matchHtml = "";
                        for (const match of matches) {
                            matchHtml += `<pre class="snippet color-dynamic-fade" data-color="${file.color}" data-prop="content">...${match.snippet}...</pre>`;
                        }
                        file_html +=
                            `<div class="search-view-matches-item color-dynamic" data-color="${file.color}">
                            <p>
                                <i>content</i>:<span> ${resultsObj.searchValue}</span> ${contentInfo}
                            </p>
                            ${matchHtml}
                        </div>`;

                    } else if (prop === 'tags') {
                        // Render each matched tag as its own span with data-tag so the
                        // [data-tag] highlight selector in props-highlight.js picks up every match.
                        const tagSpans = [...matchedTagValues]
                            .map(sv => `<span data-prop="tags" data-tag="${sv}"> ${sv}</span>`)
                            .join(',');
                        file_html +=
                            `<div class="search-view-matches-item color-dynamic" data-color="${file.color}">
                            <p>
                                <i>tags</i>:${tagSpans}
                            </p>
                        </div>`;

                    } else {
                        const rawValue = file[prop];
                        const displayValue = Array.isArray(rawValue) ? rawValue.join(', ') : rawValue;
                        file_html +=
                            `<div class="search-view-matches-item color-dynamic" data-color="${file.color}">
                            <p>
                                <i>${prop}</i>:<span data-prop="${prop}"> ${displayValue}</span>
                            </p>
                        </div>`;
                    }
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
