import { appState } from './store.js';
 
 /*
 * Sorts the globalData array (appState.myFiles) based on a specified property and data type.
 *
 * @param {string} property. The property name within the objects to sort by (e.g., 'name', 'score').
 * @param {('string'|'number'|'date')} dataType. The data type of the property's value ('string', 'number' or 'date').
 * @param {('asc'|'desc')} [sortOrder='asc'] The direction to sort: 'asc' (ascending, default) or 'desc' (descending).
 * @returns {void} The function sorts the globalData array in place.
 */
export function sortAppStateFiles(property, dataType, sortOrder = 'asc') {
  let dataArray = appState.myFiles;

  // console.log(`sorting by ${property}, type ${dataType}, order ${sortOrder}`);

  if (!dataArray || !Array.isArray(dataArray)) {
    console.error("Error: appState.myFiles is not defined or is not an array.");
    return;
  }

  let orderMultiplier = (sortOrder === 'desc' ? -1 : 1);

  dataArray.sort((a, b) => {
    // Helper function to extract the value for comparison
    let extractValue = (obj) => {
      let value = obj[property];
      
      // Use length if the value is an array ***
      if (Array.isArray(value)) {
        return value.length; // Length is always a number
      }
      return value;
    };

    const valA = extractValue(a);
    const valB = extractValue(b);
    let comparison = 0;
    
    // Determine the effective data type for comparison
    let effectiveDataType = Array.isArray(a[property]) ? 'number' : dataType;


    if (effectiveDataType === 'number') {
      comparison = valA - valB;
    } else if (effectiveDataType === 'string') {
      if (typeof valA === 'string' && typeof valB === 'string') {
        comparison = valA.localeCompare(valB);
      }
    } else if (effectiveDataType === 'date') {
      comparison = new Date(valA) - new Date(valB);
    }

    // Apply the multiplier for sort order
    return comparison * orderMultiplier;
  });

//  console.log(`appState.myFiles sorted by property: "${property}" (array length) as ${dataType}, order: ${sortOrder}.`);
}