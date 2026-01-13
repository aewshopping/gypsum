import { appState } from '../../services/store.js';
import { parseSearchString } from '../ui-functions-search/a-search-parse-string.js';

const searchBox = document.getElementById("searchbox")

export function handleSearchBoxEnterPress(target) {
    if (target.key === "Enter") {
        handleSearchBoxClick();
    }
}

export function handleSearchBoxClick() {
    const searchString = searchBox.value;
    console.log("starting seachbox search for " + searchString);

    // parse string into properties (if present) and values
    const searchObject = parseSearchString(searchString);

    // check prop name
    const propertyExists = appState.myFilesProperties.has(searchObject.property);
    if (propertyExists) {
        console.log(appState.myFilesProperties.get(searchObject.property).type);
    }


    // look up prop type

    // create id for searchfilter

    // creater filter object

    // add object to searchfilter map
}