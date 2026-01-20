import { appState } from "../../services/store.js";
import { processSeachResults } from "../ui-functions-search/a-search-orchestrator.js";

export function handleFilterToggleActive(evt, target){

console.log("toggle active now")

const filterstatus = target.dataset.active;
const filterId = target.dataset.filterid; // filterId is saved on the elem when by highlighting function
const filters = appState.search.filters;

    if (filterstatus === "false") { // need to toggle on

        target.dataset.active="true";
        filters.get(filterId).active = true;

        processSeachResults(); // renders files

    } else if (filterstatus === "true"){ // need to toggle off
        
        target.dataset.active="false";
        filters.get(filterId).active = false;

        processSeachResults(); // renders files

    }

}