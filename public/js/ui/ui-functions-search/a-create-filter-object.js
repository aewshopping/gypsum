import { appState } from "../../services/store.js";

export function createFilterObject(searchObject) {
    let propertyExists = false;
    let propertyType = "string"; // default

    const { property, operator, value } = searchObject;

    // 2. look up prop type, or check uses special props of allProps or content. Note the property search is case sensitive which needs some thinking about.
    propertyExists = appState.myFilesProperties.has(property);
    if (propertyExists) {

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
        timestamp: timeNow
    }

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