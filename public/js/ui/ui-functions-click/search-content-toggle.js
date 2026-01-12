import { appState } from '../../services/store.js';

export function handleContentSearchToggle(evt, target) {
    
    const searchbox = document.getElementById("searchbox");

    if (target.checked) {
        
        const searchMode = "allContent"; // **REMOVE LATER**
        appState.search.mode = searchMode; // **REMOVE LATER**
        searchbox.placeholder = appState.search.depth.prompt.fullContent;

    } else {

        const searchMode = "onlyProperties"; // **REMOVE LATER**
        appState.search.mode = searchMode; // **REMOVE LATER**
        searchbox.placeholder = appState.search.depth.prompt.onlyProperties;
    }
}