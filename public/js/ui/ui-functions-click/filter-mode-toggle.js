import { appState } from '../../services/store.js';
import { updateMyFilesShowState } from "../ui-functions-search/filter-files.js";

/**
 * Handles the toggling of the filter mode between 'AND' and 'OR'.
 * It reads the state of the checkbox that triggered the event, updates the `filterMode` in the `appState`,
 * and then re-runs the file filtering logic to apply the new mode.
 * @param {Event} event The change event from the filter mode toggle checkbox.
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
