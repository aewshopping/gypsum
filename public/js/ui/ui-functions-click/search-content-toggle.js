import { appState } from '../../services/store.js';

export function handleContentSearchToggle(evt, target) {
    
    const searchbox = document.getElementById("searchbox");

    if (target.checked) {
        
        const searchMode = "fullContent";
        appState.search.depth.searchMode = searchMode;
        searchbox.placeholder = appState.search.depth.prompt[searchMode];

    } else {

        const searchMode = "onlyProperties";
        appState.search.depth.searchMode = searchMode;
        searchbox.placeholder = appState.search.depth.prompt[searchMode];
    }
}