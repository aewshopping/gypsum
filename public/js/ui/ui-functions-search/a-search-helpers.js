/**
 * @file This file contains helper functions used by the search property functions
 *  and the search content function. Designed to make sure a standard search result
 * is provided and put in the same place!
 */

import { appState } from "../../services/store.js";

/**
 * Helper: Standardizes the Map retrieval
 */
export function getFilterMap(filterId) {
    let map = appState.search.results.get(filterId);
    return (map instanceof Map) ? map : new Map();
}

/**
 * Helper: Finalizes the state update
 */
export function updateSearchState(filterId, resultsMap) {
    if (resultsMap.size > 0) {
        appState.search.results.set(filterId, resultsMap);
    }
}

/**
 * Helper: Records a result object into the provided Map if the count is valid.
 */
export function recordMatch(map, filename, resultObject) {
 //   console.log("filename: " + filename);
 //   console.log(resultObject);
 //  console.log(map);
    if (resultObject && resultObject.count > 0) {
        map.set(filename, resultObject);
    }
}

/**
 * Helper function to construct the match result object for content searches
 * (with text match snippets)
 */
export function buildMatchResultObject(count, property, type, operator, matches) {
    const result = {
        count: count,
        property_match: property,
        property_type: type,
        search_operator: operator
    };

    // Check if matches is provided and has content (e.g., a non-empty array)
    if (matches && matches.length > 0) {
        result.matches = matches;
    }

    return result;
}
