import { renderTagTaxonomy } from '../render-tag-taxonmy.js';
import { appState } from '../../services/store.js';
import { handleContentSearchToggle } from './search-content-toggle.js';

/**
 * Renders the tag taxonomy into the DOM on user request.
 * If full content search is active, deactivates it first so the tag search
 * operates on properties only.
 * @returns {void}
 */
export function handleShowTagTaxonomy() {
    if (appState.search.depth.searchMode === "fullContent") {
        const checkbox = document.getElementById("contentsearch");
        checkbox.checked = false;
        handleContentSearchToggle(null, checkbox);
    }
    renderTagTaxonomy();
    const searchbox = document.getElementById('searchbox');
    searchbox.value = '';
    searchbox.focus();
    document.execCommand('insertText', false, 'tags:');
}

/**
 * Clears the tag taxonomy from the DOM and marks it as hidden.
 * @returns {void}
 */
export function handleHideTagTaxonomy() {
    appState.tagTaxonomyVisible = false;
    document.getElementById('tag-taxonomy-container').innerHTML = '';
}
