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
            case "allProps":
                propertyExists = true;
                break;
            default:
                // TODO provide some indication to the reader that the search has been aborted!
                console.log("no such property, search aborted");
                throw new Error("TRY AGAIN PLEASE");
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

    // 5. add object to searchfilter map
    appState.search.filters.set(uniqueId, filterObj);


    console.log(appState.search.filters.set(uniqueId, filterObj));
    return(uniqueId); // for use later in the orchestrator function

}