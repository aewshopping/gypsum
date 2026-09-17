import { appState } from "../../services/store.js";
import { createFilterObject } from "./a-create-filter-object.js";
import { searchFiles } from "./a-search-files.js";
import { invertSearchResultsMap } from "./a-search-invertmap.js";
import { updateFilterCountFileMatches } from "./a-search-filtercountfilematches.js";
import { renderFiles } from "../ui-functions-render/a-render-all-files.js";
import { renderFilters } from "../ui-functions-render/a-render-filter.js";

/**
 * Adds a filter and then finds the matching files.
 *
 * @param {object} searchObject An object containing the property, operator, and value for the filter.
 */
export async function addFilterThenFindMatches(searchObject) {

    // mutates appState.search.filters to add a filter to the search.filters map with the value being some search info as an object. Also directly returns the id of the new filter and booleans for whether property exists and whether the filter has already been created before.
    const filterIdandCheck = createFilterObject(searchObject);

    if (!filterIdandCheck.propertyExists) {
        // if property doesn't exist then exit, nothing to search!
        // doubles up on warning in createFilterObject
        console.log("please try searching another property");
        return
    }

    if (filterIdandCheck.filterExists) {
        // if already done the search no need to do it again...
        // actually this might not always be right. The file props are calculated on load,
        // but file content could change externally... but then you would know you had done this right??
        console.log("filter already searched");
        return
    }

    // clear the searchbox ready for next search
    document.getElementById("searchbox").value = ""

    const filterId = filterIdandCheck.uniqueId

    // do the search and save search results into search.results map (with filterId as key)
    await searchFiles(filterId);

    // move to next stage...
    processSeachResults();
}


/**
 * Processes the search results, updates the UI, and renders the files.
 *
 * The two arguments are renderFiles' own, in its order, and are passed straight to it.
 *
 * @param {boolean} [fullRender=true] - False replaces the table's rows and leaves its header and
 *   scroll chrome alone, which is all a save needs when no column has appeared.
 * @param {boolean} [keepPage=false] - Stay on the current page instead of going back to page 1.
 *   False for every filter a user adds, removes or toggles, where page 1 is where the new results
 *   start. True for a re-run over results that were already on screen — a save re-runs the filters
 *   so the counts stay right, and being sent back to page 1 by an edit on page 3 is startling.
 * @returns {{updateCallbackDone: Promise<void>}} renderFiles' own, resolved once the rows are drawn.
 */
export function processSeachResults(fullRender = true, keepPage = false) {

    // returns an inverted set of results - fileids then filterIds, then result objects. if thismap.has(fileId) then is an OR match/ if thismap.get(fileId).values.size === count of active filters then AND match
    const fileMatchResultsMap = invertSearchResultsMap();

    appState.search.matchingFiles = fileMatchResultsMap;

    // mutates appState.search.filters to include count of matches
    updateFilterCountFileMatches(appState.search);

    renderFilters();

    // Handed back as renderFiles gives it: a caller that means to mark the rows it drew has to wait
    // for them — see renderFiles.
    return renderFiles(fullRender, keepPage); // note that highlights applied within the renderFiles function

}
