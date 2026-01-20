import { appState } from '../../services/store.js';
import { processSeachResults } from '../ui-functions-search/a-search-orchestrator.js';


export function handleDeleteFilter(evt, target) {

    const filterId = target.dataset.filterid;
    //    console.log("deleting filter " + filterId);

    deleteFilterAndResults(filterId);

}

export function deleteFilterAndResults(filterId) {

    const allFilters = appState.search.filters;
    const allResults = appState.search.results;

    allResults.delete(filterId);
    allFilters.delete(filterId);

    processSeachResults();

    // TODO if tags also need to go through tag taxon and remove data-active="true" from the query selector tags 

}