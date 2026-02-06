import { appState } from '../../services/store.js';
import { processSeachResults } from '../ui-functions-search/a-search-orchestrator.js';

/**
 * Handles the toggle event for the filter mode (AND/OR).
 * Updates the app state and re-processes search results.
 * @param {Event} event - The change event from the toggle checkbox.
 * @returns {void}
 */
export function handleFilterModeToggle(event) {

    console.log("Toggling filter mode based on checkbox state.");

    const isChecked = event.target.checked;
    
    // 1. Update the state
    if (isChecked) {
        appState.filterMode = 'AND'; // TO REMOVE
        appState.search.filterMode = 'AND';
    } else {
        appState.filterMode = 'OR'; // TO REMOVE
        appState.search.filterMode = 'OR';
    }

    // 2. Re-run the file filter results
    // This immediately applies the new 'AND' or 'OR' logic to all visible notes.
    processSeachResults();

}
