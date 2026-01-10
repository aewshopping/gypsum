import { appState } from '../../services/store.js';

export function handleContentSearchToggle(evt, target) {
    
    const searchbox = document.getElementById("searchbox");

    if (target.checked) {
        console.log("on");
        const searchMode = "allContent";
        appState.search.mode = searchMode;
        searchbox.placeholder = appState.search.prompt[searchMode];

    } else {

        console.log("off");
        const searchMode = "onlyProperties";
        appState.search.mode = searchMode;
        searchbox.placeholder = appState.search.prompt[searchMode];
    }
}