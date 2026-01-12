// **REMOVE LATER**

import { getFilterParameters } from "./search-filter-prep.js";
import { searchAllFileContent } from "./search-full-content.js";
import { checkTagMatch } from "./search-tag-match.js";
import { checkStringMatch } from "./search-string-match.js";
import { checkStringQueryMatch } from "./search-stringquery-match.js";
import { appState } from "../../services/store.js";
import { renderData } from "../ui-functions-render/render-all-files.js";

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
    const filters = getFilterParameters(); 
    const { 
        filterMode,
        hasTagFilters,
        hasStringFilter,
        filterStringRaw,
    } = filters;
    
    let filesForAsyncSearch = [];

    const isAllContentMode = appState.search.mode === 'allContent';
    const requiresAsyncCheck = hasStringFilter && isAllContentMode;

    // --- Core Iteration: Perform all synchronous checks ---
    appState.myFiles.forEach(file => {
        
        // Step 1: Check Tag/Metadata Condition (Always required)
        const isTagConditionMet = checkTagConditionMatch(file, filters);
        
        // Step 2: Synchronous Property String Match (Only if not in allContent mode)
        let isPropStringMatch = false; 
        if (!isAllContentMode) {
            isPropStringMatch = checkPropStringMatch(file, filters);
           // console.log("isPropStringMatch " + isPropStringMatch);
        }
        
        // 1. Determine the outcome of the combined synchronous filters (the 'isSyncMatch' state)
        // This sets the base show/hide for files NOT subject to async OR the final result for onlyProperties mode.
        let isSyncMatch = false;

        if (isAllContentMode) {
            // --- ALL CONTENT SEARCH MODE ---
            // The string search component is delegated to the async check.
            // Therefore, the only relevant synchronous check is the Tag/Metadata condition.
            // This applies to both AND and OR modes.
            isSyncMatch = isTagConditionMet;

        } else {
            // --- ONLY PROPERTIES SEARCH MODE ---
            // The synchronous result IS the final string search result.
            if (filterMode === 'AND') {
                // AND mode requires both tag and synchronous property match.
                isSyncMatch = isTagConditionMet && isPropStringMatch;
            } else if (filterMode === 'OR') {

                // OR mode FIX: Only allow the tag match to satisfy the OR if a tag filter is actually active.
                
                const matchesRequiredTag = hasTagFilters && isTagConditionMet;
                const matchesProperty = isPropStringMatch; // This is true if matched or if no string filter exists

                // The sync match is successful if EITHER a filtered tag matches, OR the string query matches.
                isSyncMatch = matchesRequiredTag || matchesProperty;
            }
        }

        // 2. Decide the file's current show state and if it needs an async check
        if (requiresAsyncCheck) {
            // If async is required, we MUST run it on any file that hasn't failed a critical check.
            
            if (filterMode === 'AND') {
                // In AND mode, if the Tag condition fails, the file is definitively hidden.
                if (!isTagConditionMet) {
                    file.show = false; 
                } else {
                    // Tag condition passed. Must run async search to check content AND get rich results.
                    file.show = false; // Temporarily hide until async result is back
                    filesForAsyncSearch.push(file);
                }
            } else if (filterMode === 'OR') {
                // In OR mode, every file needs an async check to get rich results IF a string search is active.
                // The only files we can skip are those with no tag/string filters at all, 
                // but since `requiresAsyncCheck` implies hasStringFilter is true, 
                // we must process ALL files that haven't failed the content string search already.

                // For simplicity and correctness with the rich results requirement, 
                // we must push all files to the async queue unless they were definitively meant to be excluded.
                
                // Here, since the only initial criteria is the tag filter (isPropStringMatch is false), 
                // we push every file that hasn't failed the tag filter AND those that failed tags 
                // but might pass content search (i.e., ALL files).

                // *Refinement for Rich Results:* If the user searched a string, we need rich results
                // for EVERY file that could potentially contain that string.
                filesForAsyncSearch.push(file);
                file.show = false; // Temporarily hide
            }
        } else {
            // No async search required (mode is 'onlyProperties' or no string filter).
            // The sync result is the final result.
            file.show = isSyncMatch;
        }
    });

    // --- ASYNCHRONOUS STEP (ONLY RUNS ON CANDIDATE FILES) ---
    if (filesForAsyncSearch.length > 0 && requiresAsyncCheck) {
        // Run Promise.all search for rich results (using the searchAllFileContent function)

        console.log(filesForAsyncSearch);
        const allSearchResults = await searchAllFileContent(filesForAsyncSearch, filterStringRaw); 
        
        console.log(allSearchResults);
        // Process results
        allSearchResults.forEach(({ file, richResults }) => {
            
            // NOTE: file.show was set to false or handled in the loop above.
            // We now use richResults.hasMatch to finalize the show state.

            const isContentMatch = richResults.hasMatch;
            const isTagConditionMet = checkTagConditionMatch(file, filters); // Re-check sync result

            let finalShowState = false;
            
            if (filterMode === 'AND') {
                // Final condition: Tag Match AND Content Match
                finalShowState = isTagConditionMet && isContentMatch;

            } else if (filterMode === 'OR') {
                // Final condition: Tag Match OR Content Match
                const matchesRequiredTag = hasTagFilters && isTagConditionMet;
                finalShowState = ( matchesRequiredTag ) || isContentMatch;
            }

            file.show = finalShowState;
            file.searchResult = richResults; // Store the valuable rich data!
        });
    }

    // Trigger UI update
    renderData(false);
}