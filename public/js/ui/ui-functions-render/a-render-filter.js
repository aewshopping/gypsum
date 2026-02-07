import { appState } from "../../services/store.js";

/**
 * Renders the active search filters as a series of pills in the UI.
 * @returns {void}
 */
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

            filterhtml += `<span class="tag filter-pill" data-filterid="${filterId}" data-action="filter-toggleactive" data-active="${isActive}">${propertyLabel}${operator}${filterObj.searchValue}(${filterObj.matchCount})<button class="btn-delete-filter" data-filterid="${filterId}" data-action="delete-filter">✕</button></span>`; 
    }

    outputElement.innerHTML = filterhtml;
}