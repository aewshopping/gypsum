import { appState } from "../../services/store.js";
import { searchProperty } from "./a-search-property.js";


/**
 * Searches every property of every file for a given search value.
 *
 * @function searchEveryProperty
 * @param {string} filterId The ID of the filter.
 * @param {string} searchValue The value to search for.
 * @param {string} property The property to search within (e.g., "allProperties").
 * @param {string} type The type of the property.
 * @param {string} operator The search operator.
 */
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