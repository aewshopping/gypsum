import { appState } from '../../services/store.js';
import { processSeachResults } from '../ui-functions-search/a-search-orchestrator.js';



/**
 * Handles the click event to delete a filter.
 * It populates the search box with the filter's value for potential editing,
 * unchecks the content search option, and calls the deletion helper.
 * @param {Event} evt - The click event.
 * @param {HTMLElement} target - The element that triggered the delete action.
 * @returns {void}
 */
export function handleDeleteFilter(evt, target) {

    const filterId = target.dataset.filterid;
    //    console.log("deleting filter " + filterId);

    // put search string from filter in the searchbox to allow edit
	const searchBox = document.getElementById("searchbox");
	const filterIdObj = appState.search.filters.get(filterId);
	searchBox.value = `${filterIdObj.property}${filterIdObj.operator}${filterIdObj.searchValue}`;
	
	// untick "content search" option
	const contentSearchCheckBox = document.getElementById("contentsearch");
	contentSearchCheckBox.checked = false;

    deleteFilterAndResults(filterId);

}



/**
 * Helper function to delete a filter and its associated results from the app state.
 * It also handles unhighlighting tags in the taxonomy and triggers a re-render.
 * @param {string} filterId - The ID of the filter to delete.
 * @returns {void}
 */
export function deleteFilterAndResults(filterId) {

    unhighlightTaxonomyTags(filterId);

    const allFilters = appState.search.filters;
    const allResults = appState.search.results;

    allResults.delete(filterId);
    allFilters.delete(filterId);

    processSeachResults();

}

/**
 * Manually unhighlights tags in the tag taxonomy UI when a tag filter is deleted.
 * Unlike other tags, the taxonomy is not fully re-rendered on filter changes.
 * @param {string} filterId - The ID of the deleted filter.
 * @returns {void}
 */
function unhighlightTaxonomyTags(filterId) {

    const property = appState.search.filters.get(filterId).property;
    const searchValue = appState.search.filters.get(filterId).searchValue;

    if (property !="tags" ) { return; } // only matters for tags - other properties not in tag taxon

    const container = document.querySelector('#tag_output');
    const elements = container.querySelectorAll(`[data-tag="${searchValue}"]`);

    elements.forEach(el => el.dataset.active=false);

}