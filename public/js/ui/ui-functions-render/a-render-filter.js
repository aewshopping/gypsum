import { appState } from "../../services/store.js";
import { TAGGER } from "../../constants.js";

export function renderFilters() {
    const outputElement = document.getElementById("filter-output");

    let filterhtml = "";
    for (const [filterId, filterObj] of appState.search.filters) {

        let propertyLabel = "";
        let operator = "";
        if (filterObj.property!="allProperties"){
            propertyLabel = filterObj.property;
            operator = filterObj.operator;
        }

            filterhtml += `<code><span class="tag" data-filterId="${filterId}" data-action="delete-filter">${propertyLabel}${operator}${filterObj.searchValue}(${filterObj.matchCount})</span></code> `; // note the (deliberate!) whitespace at the end which seperates the tags when joined together...
    }

    outputElement.innerHTML = filterhtml;
}