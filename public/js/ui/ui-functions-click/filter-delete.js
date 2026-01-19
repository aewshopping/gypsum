import { appState } from '../../services/store.js';
import { processSeachResults } from '../ui-functions-search/a-search-orchestrator.js';


export function handleDeleteFilter(evt, target) {

    const filterId = target.dataset.filterid;
//    console.log("deleting filter " + filterId);

    const allFilters = appState.search.filters;
    const allResults = appState.search.results;

    allResults.delete(filterId);
    allFilters.delete(filterId);

    processSeachResults();
}