import { appState } from "../../services/store.js";
import { getFilterMap } from "./a-search-helpers.js";
import { updateSearchState } from "./a-search-helpers.js";
import { recordMatch } from "./a-search-helpers.js";
import { buildMatchResultObject } from "./a-search-helpers.js";


export function searchProperty(filterId, searchValue, property, type, operator) {
    const searchValueLower = searchValue.toLowerCase();

    // TODO build in case number and date
    switch (type) {
        case 'array':
            searchArrayProperty(filterId, searchValueLower, property, type, operator);
            break;
        default:
            searchStringProperty(filterId, searchValueLower, property, type, operator);
    }
}



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
        const resultObject = buildMatchResultObject(matchCount, property, type, operator);

        // 2. Record the match into the results map
        recordMatch(filterResultsMap, file.id, resultObject);
    }

    updateSearchState(filterId, filterResultsMap);
}

function searchStringProperty(filterId, searchValueLower, property, type, operator) {
    const filterResultsMap = getFilterMap(filterId);

    for (const file of appState.myFiles) {
        const item = file[property];
        if (item == null) continue;

        const textToSearch = (Array.isArray(item) ? item.join('') : String(item)).toLowerCase();

        if (textToSearch.includes(searchValueLower)) {
            const occurrences = textToSearch.split(searchValueLower).length - 1;

            // 1. Build the independent result object
            const resultObject = buildMatchResultObject(occurrences, property, type, operator);
            
            // 2. Pass the object to the record function
            recordMatch(filterResultsMap, file.id, resultObject);
        }
    }

    updateSearchState(filterId, filterResultsMap);
}
