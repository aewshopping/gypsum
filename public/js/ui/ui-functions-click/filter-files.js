import { TAGGER } from '../../constants.js'; // Still used for visual highlighting in the current DOM
import { appState } from '../../services/store.js';
import { renderData } from '../ui-functions-render/render-all-files.js';
import { renderActiveTags } from '../ui-functions-render/render-active-tags.js';

/**
 * Iterates through all notes in appState.myFiles and updates their 'show' key
 * based on the currently selected tags stored in appState.filterTags.
 */
export function updateMyFilesShowState() {
    // 1. Get the list of ALL currently selected unique tags from the state.
    const selectedTags = appState.filterTags;
    const requiredMatchCount = selectedTags.size;

    const currentMode = appState.filterMode; // 'AND' or 'OR'

    // console.log(`tags: ${selectedTags}, count: ${requiredMatchCount}, mode: ${currentMode}`)
    
    // 2. Iterate through appState.myFiles and apply the filtering logic.
    appState.myFiles.forEach(file => {
        if (!file.tags || requiredMatchCount === 0) {
            file.show = true; // Show everything if no tags are selected or file has no tags
            return;
        }
        
        let matchCount = 0;
        // Check the note's tags against the set of selected tags
        for (const tag of file.tags) {
            if (selectedTags.has(tag)) {
                matchCount++;
            }
        }
        
        if (currentMode === 'AND') {
            // Logic for "AND" filtering: A note must contain ALL selected tags.
            if (matchCount >= requiredMatchCount) {
                file.show = true;
            } else {
                file.show = false;
            }
        } else if (currentMode === 'OR') {
            // Logic for "OR" filtering: A note must contain AT LEAST ONE selected tag.
            if (matchCount >= 1) { // If matchCount is 1 or more, the OR condition is met.
                file.show = true;
            } else {
                file.show = false;
            }
        } else {
            // Fallback (e.g., if filterMode is invalid)
            file.show = true;
        }

    });

    // 3. Trigger the UI to re-render or update based on the new 'show' state. For the table view we only want to render rows not re-render header hence the "fullRender" = false arg. Does nothing for other views.
    renderData(false);
}


/**
 * Handles the click event on a tag element, updating the appState.filterTags Set
 * and then updating the 'show' key in the appState.myFiles array.
 * @param {Event} evt The click event object
 * @param {Target} target The target object
 */
export function handleTagClick(evt, target) {

// this isn't checking for tag in classList[0] as it should be...
    const tagName = target.classList[1];
    if (!tagName) {
        console.error("Clicked element does not have a tag class at index 1.");
        return;
    }

    // console.log(`tag name: ${tagName}`);

    // 1. Update appState.filterTags (The Source of Truth)
    if (appState.filterTags.has(tagName)) {
        // Tag was selected, now deselecting it
        appState.filterTags.delete(tagName);
    } else {
        // Tag was not selected, now selecting it
        appState.filterTags.add(tagName);
    }

    // 2. Provides immediate feedback if needed for future debugging
    // renderActiveTags();
    
    // 3. Update the core application state for filtering the notes.
    updateMyFilesShowState();
    
}