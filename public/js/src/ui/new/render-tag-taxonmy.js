import { appState } from '../../services/store.js';

export function renderTagTaxonomy() {

    console.log(appState.myTaxonomy);

    document.getElementById('tag_output').innerHTML = appState.myTaxonomy
}