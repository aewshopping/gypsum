import { appState } from "../../services/store.js";
import { createFilterObject } from "./a-create-filter-object.js";
import { searchFiles } from "./a-search-files.js";

export function searchOrchestrator(searchObject) {

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

}