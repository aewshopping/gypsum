import { appState } from '../../services/store.js';
import { updateMyFilesShowState } from "../ui-functions-search/filter-files.js";

/**
 * Handles the toggling of the tag filter mode between 'AND' and 'OR'.
 * It reads the state of the checkbox that triggered the event,
 * updates the `appState.filterMode`, and then immediately re-applies
 * the filtering logic to update the view.
 * @param {Event} event The change event object from the filter mode toggle switch.
 */
export function handleFilterModeToggle(event) {

    console.log("Toggling filter mode based on checkbox state.");

    const isChecked = event.target.checked;
    
    // 1. Update the state
    if (isChecked) {
        appState.filterMode = 'AND';
    } else {
        appState.filterMode = 'OR';
    }

    // 2. Re-run the main filtering function
    // This immediately applies the new 'AND' or 'OR' logic to all visible notes.
    updateMyFilesShowState();

}
