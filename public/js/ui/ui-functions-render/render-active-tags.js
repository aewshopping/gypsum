import { TAGGER } from '../../constants.js'; 
import { appState } from '../../services/store.js';

/**
 * Updates the visual state of tag elements in the UI to reflect the current filter state.
 * It first removes the 'active-tag-filter' class from all tags, then iterates through
 * the `appState.filterTags` set and applies the class to the corresponding tag elements,
 * ensuring the UI is in sync with the application's state.
 */
export function renderActiveTags() {
// First, remove the TAGGER class from *all* elements to ensure a clean slate.
// (This is often faster than checking individual elements)
document.querySelectorAll(`.${TAGGER}`).forEach(el => {
    el.classList.remove(TAGGER);
});

// Then, iterate through the authoritative list (appState.filterTags) 
// and apply the highlight only to the tags that should be selected.
appState.filterTags.forEach(selectedTagName => {
    const matchingTags = document.querySelectorAll(`[data-tag="${selectedTagName}"]`);
    matchingTags.forEach(tagElem => {
        tagElem.classList.add(TAGGER);
    });
});
    
}