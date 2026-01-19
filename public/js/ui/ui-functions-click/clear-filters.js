import { appState } from '../../services/store.js';
import { processSeachResults } from '../ui-functions-search/a-search-orchestrator.js';


export function handleClearFilters() {
    const searchBox = document.getElementById("searchbox");

    appState.search.filters.clear();
    appState.search.results.clear();
    searchBox.value = "";

    processSeachResults();

}