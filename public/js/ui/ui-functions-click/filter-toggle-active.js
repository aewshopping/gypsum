import { appState } from "../../services/store.js";

export function handleFilterToggleActive(evt, target){

console.log("toggle active now")

const filterstatus = target.dataset.active;
const filterId = target.dataset.filterid; // filterId is saved on the elem when highlighted
const resultsMap = appState.search.results;
const resultsCacheMap = appState.search.resultsCache;

    if (filterstatus === "false") { // need to toggle on

        target.dataset.active="true";

/*        const filterData = resultsCacheMap.get(filterId);
        resultsMap.set(filterData);
        resultsCacheMap.delete(filterId);

        processSeachResults(); // renders files*/

    } else if (filterstatus === "true"){ // need to toggle off
        
        target.dataset.active="false";

/*        resultsMap.get(filterId).active = false;
*/

      //  deleteFilterAndResults(filterId); // use this filterId to delete the filter and rerender
    }

}