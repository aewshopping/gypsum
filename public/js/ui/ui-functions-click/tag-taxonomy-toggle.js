import { renderTagTaxonomy } from '../render-tag-taxonmy.js';
import { appState } from '../../services/store.js';

/**
 * Renders the tag taxonomy into the DOM on user request.
 * @returns {void}
 */
export function handleShowTagTaxonomy() {
    renderTagTaxonomy();
}

/**
 * Clears the tag taxonomy from the DOM and marks it as hidden.
 * @returns {void}
 */
export function handleHideTagTaxonomy() {
    appState.tagTaxonomyVisible = false;
    document.getElementById('tag_output').innerHTML = '';
}
