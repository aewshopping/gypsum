/**
 * @fileoverview UI handlers for the search box (click and Enter key).
*/
import { appState } from '../../services/store.js';
import { parseSearchString } from '../ui-functions-search/a-search-parse-string.js'; 


const searchBox = document.getElementById("searchbox");
const contentSearch = document.getElementById("contentsearch");

export function handleSearchBoxEnterPress(target) {
    if (target.key === "Enter") {
        handleSearchBoxClick();
    }
}

/**
 * Handle search action triggered by click or Enter.
 *
 * Parses the search string, validates the property against available file properties,
 * constructs a filter object and stores it in appState.search.filters.
 *
 * @returns {void}
 */
export function handleSearchBoxClick() {
    if (appState.myFiles.length === 0){
        console.log("no files to search");
        return;
    }

    const searchString = searchBox.value;
    console.log("starting seachbox search for " + searchString);

    let searchObject = {};

    // 1. parse string into properties (if present) and values. Force property to be "content" if full search option ticked
    if (contentSearch.checked) {
        searchObject = parseSearchString(searchString, "content");
    } else {
        searchObject = parseSearchString(searchString);
    }

    let propertyExists = false;
    let propertyType = "string"; // default

    // 2. look up prop type, or check uses special props of allProps or content
    propertyExists = appState.myFilesProperties.has(searchObject.property);
    if (propertyExists) {
  //      propertyType = appState.myFilesProperties.get(searchObject.property).search_type || appState.myFilesProperties.get(searchObject.property).type;


const propObj = appState.myFilesProperties.get(searchObject.property);
propertyType = propObj?.search_type || propObj?.type;

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

    console.log(appState.search.filters);
}