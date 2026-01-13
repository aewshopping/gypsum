import { appState } from "../../services/store.js";

export function createFilterObject(searchObject) {   
    let propertyExists = false;
    let propertyType = "string"; // default

    // 2. look up prop type, or check uses special props of allProps or content. Note the property search is case sensitive which needs some thinking about.
    propertyExists = appState.myFilesProperties.has(searchObject.property);
    if (propertyExists) {

        const propertyObj = appState.myFilesProperties.get(searchObject.property);
        propertyType = propertyObj?.search_type || propertyObj?.type;

    } else {

        switch (searchObject.property) {
            case "content":
                propertyExists = true;
                break;
            case "allProps":
                propertyExists = true;
                break;
            default:
                // TODO provide some indication to the reader that the search has been aborted!
                console.log("no such property, search aborted");
                return;
        }
    }

    // 3. create id for searchfilter
    const myId = Date.now(); // get a timestamp

    // 4. creater filter object
    const filterObj = {
        searchValue: searchObject.value,
        operator: searchObject.operator,
        type: propertyType,
        property: searchObject.property,
    }

    // 5. add object to searchfilter map
    appState.search.filters.set(myId, filterObj);

    return(myId);
}