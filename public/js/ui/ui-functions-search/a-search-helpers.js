/**
 * @file This file contains helper functions used by the search property functions
 *  and the search content function. Designed to make sure a standard search result
 * is provided and put in the same place!
 */

import { appState } from "../../services/store.js";

/**
 * Retrieves the results Map for a given filter ID from the app state.
 * If no such Map exists, a new one is returned.
 * @param {string} filterId - The unique ID of the filter.
 * @returns {Map<string, object>} The Map of results for the specified filter.
 */
export function getFilterMap(filterId) {
    let map = appState.search.results.get(filterId);
    return (map instanceof Map) ? map : new Map();
}

/**
 * Stores a results Map for a filter ID in the app state if the Map is not empty.
 * @param {string} filterId - The unique ID of the filter.
 * @param {Map<string, object>} resultsMap - The Map containing search results.
 * @returns {void}
 */
export function updateSearchState(filterId, resultsMap) {
    if (resultsMap.size > 0) {
        appState.search.results.set(filterId, resultsMap);
    }
}

/**
 * Records a match result object into a results Map if it indicates at least one match.
 * @param {Map<string, object>} map - The results Map to update.
 * @param {string} fileId - The ID of the file where the match was found.
 * @param {object} resultObject - The result object containing match information.
 * @returns {void}
 */
export function recordMatch(map, fileId, resultObject) {
    if (resultObject && resultObject.count > 0) {
        map.set(fileId, resultObject);
    }
}

/**
 * Constructs a standardized match result object.
 * @param {number} count - The number of matches found.
 * @param {string} property - The property where the matches were found.
 * @param {string} type - The data type of the property.
 * @param {string} operator - The search operator used.
 * @param {Array<object>|null} matches - An optional array of detailed match information (e.g., snippets).
 * @param {string} searchValueLower - The search value used, in lowercase.
 * @returns {object} The constructed match result object.
 */
export function buildMatchResultObject(count, property, type, operator, matches, searchValueLower) {
    const result = {
        count: count,
        property_match: property,
        property_type: type,
        search_operator: operator,
        searchValue: searchValueLower
    };

    // Check if matches is provided and has content (e.g., a non-empty array)
    if (matches && matches.length > 0) {
        result.matches = matches;
    }

    return result;
}
