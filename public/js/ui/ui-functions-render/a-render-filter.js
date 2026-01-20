import { appState } from "../../services/store.js";

export function renderFilters() {
    const outputElement = document.getElementById("filter-output");

    // console.log(appState.search.filters);

    let filterhtml = "";
    for (const [filterId, filterObj] of appState.search.filters) {

        let isActive = "false"
        if(filterObj.active===true){
            isActive="true";
        }

        let propertyLabel = "";
        let operator = "";
        if (filterObj.property!="allProperties"){
            propertyLabel = filterObj.property;
            operator = filterObj.operator;
        }

            filterhtml += `<code><span class="tag" data-filterid="${filterId}" data-action="filter-toggleactive" data-active="${isActive}">${propertyLabel}${operator}${filterObj.searchValue}(${filterObj.matchCount})<button class="btn-delete-filter" data-filterid="${filterId}" data-action="delete-filter">✕</button></span></code> `; // note the (deliberate!) whitespace at the end which seperates the tags when joined together...
    }

    outputElement.innerHTML = filterhtml;
}