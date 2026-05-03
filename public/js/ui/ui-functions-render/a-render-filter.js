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

        const isActive = filterObj.active === true ? "true" : "false";
        const isNegate = filterObj.negate === true ? "true" : "false";

        let propertyLabel = "";
        let operator = "";
        if (filterObj.property!="allProperties"){
            propertyLabel = filterObj.property;
            operator = filterObj.operator;
        }

            filterhtml += `<span class="tag filter-pill" data-filterid="${filterId}" data-action="filter-togglestate" data-active="${isActive}" data-negate="${isNegate}">${propertyLabel}${operator}${filterObj.searchValue}(${filterObj.matchCount})<button class="btn-delete-filter" data-filterid="${filterId}" data-action="delete-filter">✕</button></span>`;
    }

    outputElement.innerHTML = filterhtml;
}