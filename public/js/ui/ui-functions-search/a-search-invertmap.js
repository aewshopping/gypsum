import { appState } from "../../services/store.js";

/**
 * Inverts the search results map, so that the file IDs are the keys and the filter IDs are the values.
 *
 * @returns {Map<string, Map<string, object>>} The inverted search results map.
 */
export function invertSearchResultsMap() {
  const invertedMap = new Map();
  const searchResults = appState.search.results;
  const filters = appState.search.filters;

  // Iterate through the outer map (filterId)
  for (const [filterId, innerMap] of searchResults) {

    // look up if filter is active, if it **isn't** skip to next filterId key
    if (filters.get(filterId).active!=true) {
      continue;
    }
    
    // Iterate through the inner map (fileId)
    for (const [fileId, resultsObj] of innerMap) {
      
      // If the fileId isn't in our new map yet, create an inner Map for it
      if (!invertedMap.has(fileId)) {
        invertedMap.set(fileId, new Map());
      }
      
      // Set the filterId and the original results object
      invertedMap.get(fileId).set(filterId, resultsObj);
    }
  }

  return invertedMap;
}