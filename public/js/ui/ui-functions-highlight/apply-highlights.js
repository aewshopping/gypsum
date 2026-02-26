import { appState } from "../../services/store.js";
import { tagsHighlight } from "./tags-highlight.js";
import { updatePropHighlights } from "./props-highlight.js";


/**
 * Orchestrates the application of highlights for both tags and properties.
 * This is typically called after rendering the file list.
 * @function applyHighlights
 * @returns {void}
 */
export function applyHighlights() {

    highlightTagMatches();
    highlightPropMatches();
}

/**
 * Iterates through active tag filters and applies highlights to matching tags in the UI.
 * @function highlightTagMatches
 * @returns {void}
 */
function highlightTagMatches() {

    for (const [key, filter] of appState.search.filters) {

        if (filter.property === "tags")
            if (filter.active === true) {

                tagsHighlight(filter.searchValue, "true"); // need to switch tags to true as well, so they are highlighted

            } else if (filter.active === false) {

                tagsHighlight(filter.searchValue, "false"); // set tags to false so they are not highlighted

            }
    }

}

/**
 * Triggers the update of property highlights for the main output and the file content modal.
 * @function highlightPropMatches
 * @returns {void}
 */
export function highlightPropMatches() {

    // we need to pass all elements every time because the function clears CSS.highlights at the start
    // (ie can't pass one element at a time)
    // Reason for this is so that all elems have same css selector "match" otherwise would need multiple css selectors for different categories of highlight.
    const idsToHighlight = ['output', 'moving-file-content-container'];
    updatePropHighlights(idsToHighlight);

}