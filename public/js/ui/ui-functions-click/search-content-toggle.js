import { appState } from '../../services/store.js';

export function handleContentSearchToggle(evt, target) {
    
    const searchbox = document.getElementById("searchbox");

    if (target.checked) {
        
        const searchMode = "allContent";
        appState.search.mode = searchMode;
        searchbox.placeholder = appState.search.prompt[searchMode];

    } else {

        const searchMode = "onlyProperties";
        appState.search.mode = searchMode;
        searchbox.placeholder = appState.search.prompt[searchMode];
    }
}