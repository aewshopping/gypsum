import { appState } from "../../services/store.js";
import { searchProperty } from "./a-search-property.js";


export function searchEveryProperty(filterId, searchValue, property, type, operator) {

    const excludedSet = new Set(appState.search.excludedProperties); // specified excluded props
    const allPropsSet = new Set(appState.myFilesProperties.keys()); // all props currently in use by the files

    const filteredPropsSet = allPropsSet.difference(excludedSet); // all props less the excluded ones. These are the ones to search!
    
    // search through all properties one by one.
    for (const thisproperty of filteredPropsSet) {

        // look up data type of thisproperty. First choice: search_type; second choice: type; default: string type
        const propertyObj = appState.myFilesProperties.get(thisproperty);
        let propertyType = "string"; // default
        propertyType = propertyObj?.search_type || propertyObj?.type;

        searchProperty(filterId, searchValue, thisproperty, propertyType, operator);
    }

}