import { appState } from "../../services/store.js";
import { createFilterObject } from "./a-create-filter-object.js";
import { searchFiles } from "./a-search-files.js";
import { invertSearchResultsMap } from "./a-search-invertmap.js";
import { updateFilterCountFileMatches } from "./a-search-filtercountfilematches.js";
import { renderFiles } from "../ui-functions-render/a-render-all-files.js";
import { renderFilters } from "../ui-functions-render/a-render-filter.js";
import { tagsHighlight } from "../ui-functions-highlight/tags-highlight.js";

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


    console.log(appState.search.results);

    // move to next stage...
    processSeachResults();
}


export function processSeachResults() {

    // returns an inverted set of results - fileids then filterIds, then result objects. if thismap.has(fileId) then is an OR match/ if thismap.get(fileId).values.size === count of active filters then AND match
    const fileMatchResultsMap = invertSearchResultsMap();

    appState.search.matchingFiles = fileMatchResultsMap;

    // mutates appState.search.filters to include count of matches
    updateFilterCountFileMatches(appState.search);

    renderFilters();
    renderFiles();

    highlightMatches();

}

export function highlightMatches() {

    for (const [key, filter] of appState.search.filters) {

        if (filter.property === "tags")
            if (filter.active === true) {

                tagsHighlight(filter.searchValue, "true", key); // need to switch tags to true as well, so they are highlighted

            } else if (filter.active === false) {

                tagsHighlight(filter.searchValue, "false"); // set tags to false so they are not highlighted

            }
    }

}