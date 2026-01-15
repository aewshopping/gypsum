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

// array matches must be **exact**, for example if we are matching tags (an array)
// the search value (eg "ai") must exactly match the search value 
function searchArrayProperty(filterId, searchValueLower, property, type, operator) {
    for (const file of appState.myFiles) {

        // Ensure the property exists and is an array to prevent errors
        const items = file[property];
        if (!Array.isArray(items)) continue;

        for (const item of items) {
            if (searchValueLower === item.toLowerCase()) {
                // Get the existing array or an empty array if it doesn't exist
                const existingFilters = appState.search.results.get(file.filename) || [];

                // Add the new filterId if it's not already in the array
                if (!existingFilters.includes(filterId)) {
                    existingFilters.push(filterId);
                }
                appState.search.results.set(file.filename, existingFilters);
                // This breaks the tag loop and moves to the next file
                break;
            }
        }
    }
}

// string matches only need to **include** the search value
// for example a search value of "tree" will match "treehouse" and "braintree"
function searchStringProperty(filterId, searchValueLower, property, type, operator) {
    for (const file of appState.myFiles) {


const item = file[property];

        // Don't check property exists and is a string because some other types may be processed like a string (eg array of search_type set to string. This is to allow a contains match rather than exact match
        
  //      if (typeof item !== 'string') continue;

        if (item.toLowerCase().includes(searchValueLower)) {
            // Get the existing array or an empty array if it doesn't exist
            const existingFilters = appState.search.results.get(file.filename) || [];

            // Add the new filterId if it's not already in the array
            if (!existingFilters.includes(filterId)) {
                existingFilters.push(filterId);
            }

            appState.search.results.set(file.filename, existingFilters);
        }

    }
}