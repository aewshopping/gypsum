import { appState } from '../services/store.js';
import { renderTags } from './ui-functions-render/render-tags.js';

export function renderTagTaxonomy() {

//    console.log(appState.myTaxonomy);

    const arr = appState.myTaxonomy
    let taxon_html= "";

    for (const parent of arr) {

        // console.log(`Parent: ${parent[0]}`);

        taxon_html += `<details class="taxon">
            <summary><code>${parent[0]}</code></summary>`

        for (const child of parent[1]) {
    
            taxon_html += renderTags(child[0], child[1]);
        }

        taxon_html += `</details>`
    }

    taxon_html += `<details class="details_divider">
        <summary>selected categories</summary>
        </details>`

    document.getElementById('tag_output').innerHTML = taxon_html;
}