import { appState } from '../../services/store.js';
import { renderData } from '../ui-functions-render/render-all-files.js';
import { processSeachResults } from '../ui-functions-search/a-search-orchestrator.js';


export function handleClearFilters() {
    const searchBox = document.getElementById("searchbox");

    appState.search.filters.clear();
    appState.search.results.clear();
    searchBox.value = "";

    processSeachResults();

// later TO REMOVE after this line    
    appState.filterTags.clear();
    appState.filterString = "";

    appState.myFiles.forEach((file) => {
        file.show = true;
    });

    searchBox.value = "";

    renderData(false);

}