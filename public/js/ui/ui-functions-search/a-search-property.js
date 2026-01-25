import { appState } from "../../services/store.js";
import { getFilterMap } from "./a-search-helpers.js";
import { updateSearchState } from "./a-search-helpers.js";
import { recordMatch } from "./a-search-helpers.js";
import { buildMatchResultObject } from "./a-search-helpers.js";


/**
 * Searches a property of all files for a given search value.
 *
 * @param {string} filterId The ID of the filter.
 * @param {string} searchValue The value to search for.
 * @param {string} property The property to search within.
 * @param {string} type The type of the property.
 * @param {string} operator The search operator.
 */
export function searchProperty(filterId, searchValue, property, type, operator) {
    const searchValueLower = searchValue.toLowerCase();

    // Find the actual case property key once before starting any loops, checking the keys (properties) of myFilesProperties to see what the real casing is. So iff you have searched 'sizeinbytes' it will use the actual prop name which could be 'sizeInBytes'
    let actualCasePropertyName = property; // Fallback to input if not found
    for (const key of appState.myFilesProperties.keys()) {
        if (key.toLowerCase() === property.toLowerCase()) {
            actualCasePropertyName = key;
            break; // stop when found
        }
    }

    // TODO build in case number and date
    switch (type) {
        case 'array':
            searchArrayProperty(filterId, searchValueLower, actualCasePropertyName, type, operator);
            break;
        default:
            searchStringProperty(filterId, searchValueLower, actualCasePropertyName, type, operator);
    }
}



/**
 * Searches an array property of all files for a given search value.
 *
 * @param {string} filterId The ID of the filter.
 * @param {string} searchValueLower The lowercase value to search for.
 * @param {string} property The property to search within.
 * @param {string} type The type of the property.
 * @param {string} operator The search operator.
 */
function searchArrayProperty(filterId, searchValueLower, property, type, operator) {
    const filterResultsMap = getFilterMap(filterId);

    for (const file of appState.myFiles) {
        const items = file[property];
        if (!Array.isArray(items)) continue;

        let matchCount = 0;
        for (const item of items) {
            if (item != null && searchValueLower === String(item).toLowerCase()) {
                matchCount++;
            }
        }
        
        // 1. Build the independent result object
        const resultObject = buildMatchResultObject(matchCount, property, type, operator, null, searchValueLower);

        // 2. Record the match into the results map
        recordMatch(filterResultsMap, file.id.toString(), resultObject);
    }

    updateSearchState(filterId, filterResultsMap);
}


/**
 * Searches a string property of all files for a given search value.
 *
 * @param {string} filterId The ID of the filter.
 * @param {string} searchValueLower The lowercase value to search for.
 * @param {string} property The property to search within.
 * @param {string} type The type of the property.
 * @param {string} operator The search operator.
 */
function searchStringProperty(filterId, searchValueLower, property, type, operator) {
    const filterResultsMap = getFilterMap(filterId);

    for (const file of appState.myFiles) {

        //  const actualKey = Object.keys(file).find(key => key.toLowerCase() === property.toLowerCase());
        const item = file[property];
        if (item == null) continue;

        const textToSearch = (Array.isArray(item) ? item.join('') : String(item)).toLowerCase();

        if (textToSearch.includes(searchValueLower)) {
            const occurrences = textToSearch.split(searchValueLower).length - 1;

            // 1. Build the independent result object
            const resultObject = buildMatchResultObject(occurrences, property, type, operator, null, searchValueLower);

            // 2. Pass the object to the record function
            recordMatch(filterResultsMap, file.id.toString(), resultObject);
        }
    }

    updateSearchState(filterId, filterResultsMap);
}
