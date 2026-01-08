import { appState } from "../../services/store.js";

// --- Filter Preparation Function ---

/**
 * Calculates and returns a comprehensive object containing all current filter state
 * and derived properties, ensuring calculations like lower-casing the string are done once.
 * TODO - update to reflect the fact that filter string is now tokenised...
 * @returns {object} An object containing the current filter state and its derived properties.
 */
export function getFilterParameters() {
    const filterString = appState.filterString; // already been tokenised and lowercased...
    const arrayTokenObjects = filterString ? filterString : '';
    const hasTagFilters = appState.filterTags.size > 0;
    const hasStringFilter = !!arrayTokenObjects;
    
    // The total number of required filter *types* (Tag filter is one, String filter is one)
    const requiredTotalFilters = (hasTagFilters ? 1 : 0) + (hasStringFilter ? 1 : 0);

    return {
        // Direct state inputs
        filterTags: appState.filterTags,
        filterMode: appState.filterMode, 
        
        // Derived inputs (calculated once)
        arrayTokenObjects: arrayTokenObjects,
        hasTagFilters: hasTagFilters,
        hasStringFilter: hasStringFilter,
        requiredTotalFilters: requiredTotalFilters
    };
}