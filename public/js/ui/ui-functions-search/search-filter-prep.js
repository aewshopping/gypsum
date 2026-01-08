import { appState } from "../../services/store.js";

// --- Filter Preparation Function ---

/**
 * Calculates and returns a comprehensive object containing all current filter state
 * and derived properties, ensuring calculations like lower-casing the string are done once.
 * @returns {object} An object containing the current filter state and its derived properties.
 */
export function getFilterParameters() {
    const filterString = appState.filterString;
    const lowerFilterString = filterString ? filterString.toLowerCase() : '';
    const hasTagFilters = appState.filterTags.size > 0;
    const hasStringFilter = !!lowerFilterString;
    
    // The total number of required filter *types* (Tag filter is one, String filter is one)
    const requiredTotalFilters = (hasTagFilters ? 1 : 0) + (hasStringFilter ? 1 : 0);

    return {
        // Direct state inputs
        filterTags: appState.filterTags,
        filterMode: appState.filterMode, 
        
        // Derived inputs (calculated once)
        lowerFilterString: lowerFilterString,
        hasTagFilters: hasTagFilters,
        hasStringFilter: hasStringFilter,
        requiredTotalFilters: requiredTotalFilters
    };
}