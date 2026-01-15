import { appState } from "../../services/store.js";

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

/**
 * Helper: Standardizes the data structure added to the results map
 */
function recordMatch(map, filename, count) {
    if (count > 0) {
        map.set(filename, { count: count });
    }
}

/**
 * Helper: Standardizes the Map retrieval
 */
function getFilterMap(filterId) {
    let map = appState.search.results.get(filterId);
    return (map instanceof Map) ? map : new Map();
}

/**
 * Helper: Finalizes the state update
 */
function updateSearchState(filterId, resultsMap) {
    if (resultsMap.size > 0) {
        appState.search.results.set(filterId, resultsMap);
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

        // Standardized record keeping
        recordMatch(filterResultsMap, file.filename, matchCount);
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
            
            // Standardized record keeping
            recordMatch(filterResultsMap, file.filename, occurrences);
        }
    }

    updateSearchState(filterId, filterResultsMap);
}

