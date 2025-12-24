import { TAGGER } from '../../constants.js'; // Still used for visual highlighting in the current DOM
import { appState } from '../../services/store.js';
import { renderAllFiles } from '../ui-functions-render/render-all-files.js';
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

    // 3. Trigger the UI to re-render or update based on the new 'show' state.
    renderAllFiles();
}


/**
 * Handles the click event on a tag element, updating the appState.filterTags Set
 * and then updating the 'show' key in the appState.myFiles array.
 * @param {Event} evt The click event object.
 */
export function handleTagClick(evt) {

    const tagName = evt.target.classList[1];
    if (!tagName) {
        console.error("Clicked element does not have a tag class at index 1.");
        return;
    }

    // 1. Update appState.filterTags (The Source of Truth)
    if (appState.filterTags.has(tagName)) {
        // Tag was selected, now deselecting it
        appState.filterTags.delete(tagName);
    } else {
        // Tag was not selected, now selecting it
        appState.filterTags.add(tagName);
    }

    // 2. **VISUAL UPDATE FOR CURRENT DOM**
    // Apply the TAGGER class to all instances of the tags for visual highlighting.
    // This part provides immediate feedback and sets the state for the current DOM.
    renderActiveTags();
/*    // First, remove the TAGGER class from *all* elements to ensure a clean slate.
    // (This is often faster than checking individual elements)
    document.querySelectorAll(`.${TAGGER}`).forEach(el => {
        el.classList.remove(TAGGER);
    });

    // Then, iterate through the authoritative list (appState.filterTags) 
    // and apply the highlight only to the tags that should be selected.
    appState.filterTags.forEach(selectedTagName => {
        const matchingTags = document.querySelectorAll(`.tag.${selectedTagName}`);
        matchingTags.forEach(tagElem => {
            tagElem.classList.add(TAGGER);
        });
    });*/
    
    // 3. Update the core application state for filtering the notes.
    updateMyFilesShowState();
    
    // 4. Handle clearance if no tags are selected
  /*  if (appState.filterTags.size === 0) {
        handleClearFilters();
    }*/
}