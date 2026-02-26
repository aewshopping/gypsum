import { appState } from '../../services/store.js';

/**
 * Handles the toggle event for the "content search" option.
 * Updates the search mode in the app state and the search box placeholder.
 * @function handleContentSearchToggle
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