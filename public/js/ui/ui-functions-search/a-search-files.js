import { appState } from "../../services/store.js";
import { searchProperty } from "./a-search-property.js";
import { searchEveryProperty } from "./a-search-every-property.js";

export function searchFiles(filterId) {

    const filterObject = appState.search.filters.get(filterId);

    const {
        searchValue,
        property,
        type,
        operator
    } = filterObject;

    switch (property) {
        case 'allProps':
            searchEveryProperty(filterId, searchValue, property, type, operator);
            break;
        case 'content':
            ; // search file content async function
            break;
        default:
            searchProperty(filterId, searchValue, property, type, operator);
    }
}
