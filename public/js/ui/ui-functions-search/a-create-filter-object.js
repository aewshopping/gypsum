import { appState } from "../../services/store.js";

/**
 * Creates a filter object and adds it to the app state.
 *
 * @function createFilterObject
 * @param {object} searchObject An object containing the property, operator, and value for the filter.
 * @returns {{uniqueId: string, propertyExists: boolean, filterExists: boolean}} An object containing the unique ID of the filter, whether the property exists, and whether the filter already exists.
 */
export function createFilterObject(searchObject) {
    let propertyExists = false;
    let propertyType = "string"; // default

    let { property, operator, value } = searchObject;

    // Look up prop type, then check if uses special props of allProps or content.
    // Iterating over map keys and **not** using map.has because we need property search to be case insensitive. Allowing case insentive prop seearches is most of the complexity in this function...
    let actualPropertyName = null;
    for (const key of appState.myFilesProperties.keys()) {
        if (key.toLowerCase() === property.toLowerCase()) {
            actualPropertyName = key;
            break; // Stop looking once we find it
        }
    }
    propertyExists = !!actualPropertyName; // ie if actualPropertyName is something returns true, otherwise false

    if (propertyExists) {

        property = actualPropertyName;// Overwrite the input property with the actual case sensitive prop name found in the Map
        const propertyObj = appState.myFilesProperties.get(property);
        propertyType = propertyObj?.search_type || propertyObj?.type;

    } else {

        switch (searchObject.property) {
            case "content":
                propertyExists = true;
                break;
            case "allProperties":
                propertyExists = true;
                break;
            default:
                console.log("no such property, search aborted");
        }
    }

    // 3. create id for searchfilter
    let uniqueId = `${property}-${operator}-${value}`;

    let timeNow = Date.now(); // get a timestamp just in case we get confused about the order in which filters were created

    // 4. creater filter object
    const filterObj = {
        searchValue: value,
        operator: operator,
        type: propertyType,
        property: property,
        timestamp: timeNow,
        active: true
    }

    console.log(filterObj);

    let filterExists = false;
    const currentFilters = appState.search.filters;

    // 5. add object to searchfilter map
    if (currentFilters.get(uniqueId)) {
        filterExists = true;
    } else {
        currentFilters.set(uniqueId, filterObj);
    }

    return {
        uniqueId: uniqueId,
        propertyExists: propertyExists,
        filterExists: filterExists
    }; // for use later in the orchestrator function

}