

/**
 * Updates the match count for each filter in the search state.
 *
 * @param {object} search The search state object.
 */
export function updateFilterCountFileMatches(search) {

  // Loop through each entry in the filters Map
  // filterId is the key, filterObj is the object value
  for (const [filterId, filterObj] of search.filters) {
    
    // Attempt to get the sub-map from search.results using the filterId
    const subMap = search.results.get(filterId.toString());

    // Check if the sub-map exists
    if (subMap) {
      // Set the 'count' property to the number of entries (fileIds) in the sub-map
      filterObj.matchCount = subMap.size;
    } else {
      // If no results exist for this filter, initialize count to 0
      filterObj.matchCount = 0;
    }
  }
}