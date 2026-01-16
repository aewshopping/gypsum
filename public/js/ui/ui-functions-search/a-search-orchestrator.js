import { appState } from "../../services/store.js";
import { createFilterObject } from "./a-create-filter-object.js";
import { searchFiles } from "./a-search-files.js";
import { invertSearchResults } from "./a-search-invertmap.js";
import { updateFilterCountFileMatches } from "./a-search-filtercountfilematches.js";

export function addFilterThenFindMatches(searchObject) {

    const filterIdandCheck = createFilterObject(searchObject);

    if(!filterIdandCheck.propertyExists) {
    // if property doesn't exist then exit, nothing to search!
    // doubles up on warnign in createFilterObject
        console.log("please try searching another property");
        return 
    }

    if(filterIdandCheck.filterExists) {
        // if already done the search no need to do it again...
        // actually this might not always be right. The file props are calculated on load,
        // but file content could change externally... but then you would know you had done this right??
        console.log("filter already searched");
        return
    }

    const filterId = filterIdandCheck.uniqueId

    searchFiles(filterId);

    console.log(appState.search.results);
    
    updateFilterCountFileMatches(appState.search); // mutates appState.search.filters to include count of matches

    console.log(appState.search.filters);
//    console.log(invertSearchResults(appState.search.results)) // returns an inverted set of results - fileids then filterIds, then result objects. if thismap.has(fileId) then is an OR match/ if thismap.get(fileId).values.size === count of active filters then AND match

}