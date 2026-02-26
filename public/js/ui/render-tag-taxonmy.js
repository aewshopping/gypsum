/**
 * @file This file is responsible for rendering the tag taxonomy in the UI.
 */

import { appState } from '../services/store.js';
import { renderTags } from './ui-functions-render/render-tags.js';

/**
 * Renders the tag taxonomy as a series of `<details>` elements.
 * Each parent tag is a `<summary>`, and the child tags are rendered within the `<details>` block.
 * This function iterates through the `myTaxonomy` array in the `appState`,
 * creates an HTML string for the taxonomy, and then sets the innerHTML of the 'tag_output' element.
 * @function renderTagTaxonomy
 */
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