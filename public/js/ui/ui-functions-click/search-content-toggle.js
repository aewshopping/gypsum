import { appState } from '../../services/store.js';

/**
 * Handles the toggle event for the "content search" option.
 * Updates the search mode in the app state and the search box placeholder.
 * @param {Event} evt - The change event.
 * @param {HTMLInputElement} target - The checkbox element.
 * @returns {void}
 */
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

/**
 * Unticks content search through the toggle's own handler, so the search mode and the placeholder
 * follow the box. Setting `checked` alone fires no change event and leaves both saying "content".
 * @returns {void}
 */
export function untickContentSearch() {
    const checkbox = document.getElementById("contentsearch");
    checkbox.checked = false;
    handleContentSearchToggle(null, checkbox);
}