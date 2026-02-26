import { appState } from "../../services/store.js";
import { countActiveFilters } from "./a-count-activefilters.js";

const search = appState.search;

/**
 * Checks if a file should be shown based on the current filter mode and matching files.
 *
 * @function checkFilesToShow
 * @param {string} fileId The ID of the file to check.
 * @returns {boolean} Whether the file should be shown.
 */
export function checkFilesToShow(fileId) {

//    console.log("checking files to show" + fileId);

    if (search.matchingFiles.has(fileId)) {

        if (search.filterMode === 'OR') {
            return true;
        }

        const fileMap = search.matchingFiles.get(fileId);
        const filterCount = countActiveFilters(); // search.filters.size;
        const matchCount = fileMap.size;

        if (search.filterMode === 'AND' && matchCount === filterCount) {
            return true
        }
        return false
    }

    return false

}