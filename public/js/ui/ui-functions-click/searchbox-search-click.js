import { appState } from '../../services/store.js';
import { parseSearchString } from '../ui-functions-search/a-search-parse-string.js';
import { addFilterThenFindMatches } from '../ui-functions-search/a-search-orchestrator.js';

/**
 * @fileoverview UI handlers for the search box (click and Enter key).
*/

const searchBox = document.getElementById("searchbox");
const contentSearch = document.getElementById("contentsearch");

/**
 * Handles the keyup event in the search box, triggering a search if Enter is pressed.
 * @param {KeyboardEvent} target - The keyup event.
 * @returns {void}
 */
export function handleSearchBoxEnterPress(target) {
    if (target.key === "Enter") {
        handleSearchBoxClick();
    }
}

/**
 * Handle search action triggered by click or Enter.
 *
 * Parses the search string, validates the property against available file properties,
 * constructs a filter object and stores it in appState.search.filters.
 *
 * @returns {void}
 */
export function handleSearchBoxClick() {
    if (appState.myFiles.length === 0 || searchBox.value.length < 2) {
        console.log("no files to search, or search string less than two characters");
        return;
    }

    const searchString = searchBox.value;
  //  console.log("starting seachbox search for " + searchString);

    let searchObject = {};

    // 1. parse string into properties (if present) and values. Force property to be "content" if full search option ticked
    if (contentSearch.checked) {
        searchObject = parseSearchString(searchString, "content");
    } else {
        searchObject = parseSearchString(searchString);
    }

    addFilterThenFindMatches(searchObject);

}
