import { appState } from '../../services/store.js';
import { processSeachResults } from '../ui-functions-search/a-search-orchestrator.js';



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



export function deleteFilterAndResults(filterId) {

    unhighlightTaxonomyTags(filterId);

    const allFilters = appState.search.filters;
    const allResults = appState.search.results;

    allResults.delete(filterId);
    allFilters.delete(filterId);

    processSeachResults();

}

// for the tags in the main bit of the page we don't need to bother unhiglight them as they will get re-rendered with the data-active="true/false" status set according to appState.search.filters values. But the tag taxonomy doesn't get re-rendered so we need to manually go through and change the relevant data-actives to "false".
function unhighlightTaxonomyTags(filterId) {

    const property = appState.search.filters.get(filterId).property;
    const searchValue = appState.search.filters.get(filterId).searchValue;

    if (property !="tags" ) { return; } // only matters for tags - other properties not in tag taxon

    const container = document.querySelector('#tag_output');
    const elements = container.querySelectorAll(`[data-tag="${searchValue}"]`);

    elements.forEach(el => el.dataset.active=false);

}