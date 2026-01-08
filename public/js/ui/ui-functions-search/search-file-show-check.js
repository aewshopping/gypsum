import { checkTagMatch } from "./search-tag-match.js";
import { checkStringMatch } from "./search-string-match.js";


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
        lowerFilterString, 
        filterMode, 
        hasTagFilters, 
        hasStringFilter, 
        requiredTotalFilters 
    } = filters;
    
    const isStringMatch = checkStringMatch(file, lowerFilterString);
    const tagMatchCount = checkTagMatch(file, filterTags);

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
        if (hasStringFilter && isStringMatch) {
            actualMatchCount++;
        }
        
        // Must match all required filter types (e.g., Tag AND String)
        return actualMatchCount === requiredTotalFilters;

    } else if (filterMode === 'OR') {
        // OR mode: The file must satisfy AT LEAST ONE individual condition (tag match OR string match).
        return tagMatchCount >= 1 || isStringMatch;

    } else {
        // Fallback for invalid mode
        return true;
    }
}