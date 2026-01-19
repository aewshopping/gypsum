import { appState } from "../../services/store.js";
import { addFilterThenFindMatches } from "../ui-functions-search/a-search-orchestrator.js";
import { parseSearchString } from "../ui-functions-search/a-search-parse-string.js";
import { processSeachResults } from '../ui-functions-search/a-search-orchestrator.js';


/**
 * Handles the click event on a tag element, updating the appState.filterTags Set
 * and then updating the 'show' key in the appState.myFiles array.
 * @param {Event} evt The click event object
 * @param {Target} target The target object
 */
export function handleTagClick(evt, target) {

    const tagName = target.dataset.tag;
    if (!tagName) {
        console.error("Clicked element does not have a data-tag value.");
        return;
    }

    const searchObject = parseSearchString(tagName, "tags"); 

    addFilterThenFindMatches(searchObject);

    processSeachResults();
    
}