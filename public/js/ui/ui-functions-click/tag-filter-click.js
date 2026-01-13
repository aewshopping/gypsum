import { appState } from "../../services/store.js";
import { searchOrchestrator } from "../ui-functions-search/a-search-orchestrator.js";
import { parseSearchString } from "../ui-functions-search/a-search-parse-string.js";
import { updateMyFilesShowState } from "../ui-functions-search/filter-files.js";


/**
 * Handles the click event on a tag element, updating the appState.filterTags Set
 * and then updating the 'show' key in the appState.myFiles array.
 * @param {Event} evt The click event object
 * @param {Target} target The target object
 */
export function handleTagClick(evt, target) {

    const tagName = target.dataset.tag;
    if (!tagName) {
        console.error("Clicked element does not have a tag class at index 1.");
        return;
    }

    const searchObject = parseSearchString(tagName, "tags"); 

    searchOrchestrator(searchObject);

    // console.log(`tag name: ${tagName}`);

    // 1. Update appState.filterTags (The Source of Truth)
    if (appState.filterTags.has(tagName)) {
        // Tag was selected, now deselecting it
        appState.filterTags.delete(tagName);
    } else {
        // Tag was not selected, now selecting it
        appState.filterTags.add(tagName);
    }

    // 2. Provides immediate feedback if needed for future debugging
    // renderActiveTags();
    
    // 3. Update the core application state for filtering the notes.
    updateMyFilesShowState();
    
}