import { getFilterParameters } from "./search-filter-prep.js";
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


/**
 * STEP 1: Determines if a file satisfies the Tag/Metadata requirements.
 * This function handles all filtering logic that does NOT involve the string query.
 * * @param {object} file - The file object to evaluate.
 * @param {object} filters - The current filter criteria.
 * @returns {boolean} True if the file satisfies the tag/metadata condition for the current filterMode.
 */
export function checkTagConditionMatch(file, filters) {
    const { 
        filterTags, 
        filterMode, 
        hasTagFilters, 
        hasStringFilter // We still need this to determine the required count in AND mode
    } = filters;

    // Get the count of tags that match (this function is assumed to be synchronous)
    const tagMatchCount = checkTagMatch(file, filterTags);

    if (!hasTagFilters) {
        // If there are no tag filters active, this condition is always considered met.
        return true;
    }

    if (filterMode === 'AND') {
        // In AND mode, if tag filters exist, the file must contain ALL of them.
        return tagMatchCount === filterTags.size;

    } else if (filterMode === 'OR') {
        // In OR mode, if tag filters exist, the file must contain AT LEAST ONE of them.
        return tagMatchCount >= 1;
        
    }
    
    // Default/Fallback
    return true;
}



/**
 * STEP 2: Determines if a file satisfies the Synchronous String Query requirement.
 * This only checks file properties/metadata, not the full file content.
 * * @param {object} file - The file object to evaluate.
 * @param {object} filters - The current filter criteria.
 * @returns {boolean} True if the file matches the string query on its properties, false otherwise.
 */
export function checkPropStringMatch(file, filters) {
    const { 
        arrayTokenObjects, 
        hasStringFilter
    } = filters;

    if (!hasStringFilter) {
        // If there is no string filter active, this condition is always considered met.
        return true;
    }

    // checkStringQueryMatch is assumed to be the synchronous function 
    // that searches file metadata (e.g., name, title) against the query.
    return checkStringQueryMatch(file, arrayTokenObjects, appState.myFilesProperties);
}



export async function updateMyFilesState() {

    // 1. Setup and Get Filters (Synchronous)
    // TODO this doesn't work as requires a big change to getFilterParams
    const filters = getFilterParameters(); 
    const { filterMode, hasStringFilter, fullContentSearchEnabled } = filters;
    let filesForAsyncSearch = [];

    // --- Core Iteration: Perform all synchronous checks ---
    appState.myFiles.forEach(file => {
        
        // Step 1: Check Tag/Metadata Condition
        const isTagConditionMet = checkTagConditionMatch(file, filters);
        
        // Step 2: Check Synchronous Property String Match (If a string search is active)
        // NOTE: This check returns TRUE if hasStringFilter is FALSE.
        const isPropStringMatch = checkPropStringMatch(file, filters);


        // --- Pivot Logic: Determine the file's final 'show' state OR if it needs async search ---

        if (filterMode === 'AND') {
            // In AND mode, if the file fails EITHER synchronous check, it's immediately hidden.
            file.show = isTagConditionMet && isPropStringMatch;
            
            // If the file passed the synchronous checks AND full content search is required, 
            // it must go into the async queue.
            if (file.show && fullContentSearchEnabled && hasStringFilter) {
                filesForAsyncSearch.push(file);
            } else if (file.show && fullContentSearchEnabled && hasStringFilter) {
                // If it passed the sync checks but needs async re-validation, 
                // temporarily set to false until async result is back.
                // This is a common pattern to avoid showing it prematurely.
                file.show = false; 
                filesForAsyncSearch.push(file);
            }


        } else if (filterMode === 'OR') {
            // In OR mode, if the file passed EITHER synchronous check, 
            // it might already be shown, OR it might still need the async check.
            
            const isSyncMatch = isTagConditionMet || isPropStringMatch;
            file.show = isSyncMatch; // Default to shown if any sync criteria met.

            // A file needs ASYNC search if:
            // 1. String search is enabled AND
            // 2. Full content search is enabled AND
            // 3. The search hasn't already been satisfied by the sync string match (which only searches props)
            if (fullContentSearchEnabled && hasStringFilter) {
                 filesForAsyncSearch.push(file);
            }
        }
    });

    // --- ASYNCHRONOUS STEP (IF NECESSARY) ---
    if (filesForAsyncSearch.length > 0 && fullContentSearchEnabled && hasStringFilter) {
        // Run your Promise.all logic only on filesForAsyncSearch
        
        // ... (Insert the Promise.all logic from previous answers here) ...

        // Example: Run async search and update the final 'file.show' state based on 'AND' or 'OR' logic.
        
    } 

    // Trigger UI update
    renderData(false);
}