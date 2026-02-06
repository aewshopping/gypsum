import { appState } from '../../services/store.js';
import { processSeachResults } from '../ui-functions-search/a-search-orchestrator.js';


/**
 * Clears all active search filters and results, resets the search box, and re-renders the data.
 * @returns {void}
 */
export function handleClearFilters() {
    const searchBox = document.getElementById("searchbox");

    appState.search.filters.clear();
    appState.search.results.clear();
    searchBox.value = "";

    processSeachResults();

}