import { appState } from "../../services/store.js";
import { searchProperty } from "./a-search-property.js";


export function searchEveryProperty(filterId, searchValue, property, type, operator) {

    const excludedSet = new Set(appState.search.excludedProperties); // specified excluded props
    const allPropsSet = new Set(appState.myFilesProperties.keys()); // all props currently in use by the files

    const filteredPropsSet = allPropsSet.difference(excludedSet); // all props less the excluded ones
    
    for (const thisproperty of filteredPropsSet) {
        searchProperty(filterId, searchValue, thisproperty, type, operator);
    }

}