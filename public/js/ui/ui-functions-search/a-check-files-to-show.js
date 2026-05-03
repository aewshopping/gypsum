import { appState } from "../../services/store.js";

const search = appState.search;

/**
 * Checks if a file should be shown based on the current filter mode and matching files.
 * Each active filter is evaluated individually, respecting its `negate` flag:
 * a non-negated filter is satisfied when the file positively matched it; a negated
 * filter is satisfied when the file did NOT positively match it.
 *
 * @param {string} fileId The ID of the file to check.
 * @returns {boolean} Whether the file should be shown.
 */
export function checkFilesToShow(fileId) {

    const activeFilters = [...appState.search.filters.entries()]
        .filter(([, f]) => f.active === true);

    const fileMatchMap = search.matchingFiles.get(fileId) ?? new Map();

    const satisfies = ([filterId, filterObj]) => {
        const positiveMatch = fileMatchMap.has(filterId);
        return filterObj.negate ? !positiveMatch : positiveMatch;
    };

    if (search.filterMode === 'OR') {
        return activeFilters.some(satisfies);
    }
    return activeFilters.every(satisfies);  // AND

}