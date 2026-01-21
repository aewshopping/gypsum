import { appState } from "../../services/store.js";
import { addFilterThenFindMatches } from "../ui-functions-search/a-search-orchestrator.js";
import { parseSearchString } from "../ui-functions-search/a-search-parse-string.js";
import { processSeachResults } from '../ui-functions-search/a-search-orchestrator.js';
import { deleteFilterAndResults } from "./filter-delete.js";


/**
 * Handles the click event on a tag element, updating the appState.filterTags Set
 * and then updating the 'show' key in the appState.myFiles array.
 * @param {Event} evt The click event object
 * @param {Target} target The target object
 */
export function handleTagClick(evt, target) {

    const tagName = target.dataset.tag;
    if (!tagName) {
        console.error("Clicked element does not have a data-tag value.");
        return;
    }

    if (target.dataset.active === "false") { // need to ADD search filter

        const filters = appState.search.filters;
        const filterid = target.dataset.filterkey;
        console.log(filterid);

        // check if filter already created but currently inactive (which it must be if dataset.active===false)
        if (filters.has(filterid)) {
            console.log("filter detected");

            // set active status to true, so it will reactivate on rerender
            filters.get(filterid).active = true;

        // no filter already created so we can go ahead and create a new one
        // (if we had tried to create a new one with an identical filter already in existence, 
        // even if it wasn't active, the filter creation would just fail)
        } else {

            target.dataset.active = true; // because not all tags will be re-rendered (for eg in taxon or in modal)
            const searchObject = parseSearchString(tagName, "tags");
            addFilterThenFindMatches(searchObject); // creates the filter.results map with matches

        }

        // in both cases we now need to re render files
        processSeachResults(); // renders files



    } else if (target.dataset.active === "true") { // need to DELETE search filter

        target.dataset.active = false; // because not all tags will be re-rendered (for eg in taxon or in modal)

        const filterId = target.dataset.filterkey; // filterId is saved on the elem when highlighted

        deleteFilterAndResults(filterId); // use this filterId to delete the filter and rerender
    }

}
