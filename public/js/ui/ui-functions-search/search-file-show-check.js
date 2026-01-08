import { checkTagMatch } from "./search-tag-match.js";
import { checkStringMatch } from "./search-string-match.js";
import { checkStringQueryMatch } from "./search-stringquery-match.js";
import { appState } from "../../services/store.js";


// --- Core Filtering Logic Per File ---

/**
 * Determines if a single file should be displayed based on the current filter criteria.
 * @param {object} file - The file object to evaluate.
 * @param {object} filters - The current filter criteria, including derived properties.
 * @returns {boolean} True if the file should be shown, false otherwise.
 */
export function shouldFileBeShown(file, filters) {
    const { 
        filterTags, 
        arrayTokenObjects, 
        filterMode, 
        hasTagFilters, 
        hasStringFilter, 
        requiredTotalFilters 
    } = filters;

//    const isStringMatch = checkStringMatch(file, arrayTokenObjects); // can use for simple string match if desired, just change reference below
    const tagMatchCount = checkTagMatch(file, filterTags);
    const isStringQueryMatch = checkStringQueryMatch(file, arrayTokenObjects, appState.myFilesProperties);

    if (filterMode === 'AND') {
        let actualMatchCount = 0;

        // Check 1: Tag Filter Requirement
        if (hasTagFilters) {
            // Success if the file contains ALL selected tags.
            if (tagMatchCount === filterTags.size) {
                actualMatchCount++;
            }
        }
        
        // Check 2: String Filter Requirement
        if (hasStringFilter && isStringQueryMatch) {
            actualMatchCount++;
        }
        
        // Must match all required filter types (e.g., Tag AND String)
        return actualMatchCount === requiredTotalFilters;

    } else if (filterMode === 'OR') {

        // 1. Condition for Tag Match: The file must match AT LEAST ONE selected tag.
        //    (This implicitly relies on hasTagFilters, as tagMatchCount will be 0 if no tags are selected)
        const matchesTag = tagMatchCount >= 1;
        
        // 2. Condition for String Match: The file must match the query AND the query must be ACTIVE.
        const matchesString = hasStringFilter && isStringQueryMatch;

        // Show file if AT LEAST ONE of the conditions is met.
        return matchesTag || matchesString;

    } else {
        // Fallback for invalid mode
        return true;
    }
}