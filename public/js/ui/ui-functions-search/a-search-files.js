import { appState } from "../../services/store.js";
import { searchProperty } from "./a-search-property.js";
import { searchEveryProperty } from "./a-search-every-property.js";
import { searchContent } from "./a-search-content.js";

/**
 * Searches files based on a filter.
 *
 * @param {string} filterId The ID of the filter to use for the search.
 */
export async function searchFiles(filterId) {

    if (!appState.search.filters.has(filterId)) {
        return;
    }

    const filterObject = appState.search.filters.get(filterId);

    const {
        searchValue,
        property,
        type,
        operator
    } = filterObject;

    switch (property) {
        case 'allProperties':
            searchEveryProperty(filterId, searchValue, property, type, operator);
            break;
        case 'content':
            await searchContent(filterId, searchValue, property, type, operator);
            break;
        default:
            searchProperty(filterId, searchValue, property, type, operator);
    }
}
