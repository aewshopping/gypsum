import { appState } from "../../services/store.js";
import { processSeachResults } from "../ui-functions-search/a-search-orchestrator.js";

/**
 * Handles the click event to cycle the state of a filter pill: positive → negative → off → positive.
 * @param {Event} evt - The click event.
 * @param {HTMLElement} target - The filter pill element.
 * @returns {void}
 */
export function handleFilterToggleState(evt, target){

const active = target.dataset.active;
const negate = target.dataset.negate;
const filterId = target.dataset.filterid;
const filterObj = appState.search.filters.get(filterId);

    if (active === "true" && negate === "false") {
        target.dataset.negate = "true";
        filterObj.negate = true;
    } else if (active === "true" && negate === "true") {
        target.dataset.negate = "false";
        target.dataset.active = "false";
        filterObj.negate = false;
        filterObj.active = false;
    } else if (active === "false" && negate === "false") {
        target.dataset.active = "true";
        filterObj.active = true;
    }

    processSeachResults();

}
