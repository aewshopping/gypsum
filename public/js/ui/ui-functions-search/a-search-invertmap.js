
export function invertSearchResults(searchResults) {
  const invertedMap = new Map();

  // Iterate through the outer map (filterId)
  for (const [filterId, innerMap] of searchResults) {
    
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