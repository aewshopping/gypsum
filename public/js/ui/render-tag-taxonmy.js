/**
 * @file This file is responsible for rendering the tag taxonomy in the UI.
 */

import { appState } from '../services/store.js';
import { renderTags } from './ui-functions-render/render-tags.js';

/**
 * Renders the tag taxonomy as a series of `<details>` elements.
 * Each parent tag is a `<summary>`, and the child tags are rendered within the `<details>` block.
 * This function iterates through `appState.myParentMap` (a Map<parentName, Map<childName, count>>),
 * creates an HTML string for the taxonomy, and then sets the innerHTML of the 'tag_output' element.
 */
export function renderTagTaxonomy() {

    // Global counts (total files per tag across all parents) — used for display in every section
    const globalCounts = appState.myParentMap.get('all') ?? new Map();

    let taxon_html = "";

    for (const [parentName, childMap] of appState.myParentMap) {

        taxon_html += `<details class="taxon">
            <summary><code>${parentName}</code></summary>`

        for (const [childName] of childMap) {
            taxon_html += renderTags(childName, globalCounts.get(childName) ?? null);
        }

        taxon_html += `</details>`
    }

    taxon_html += `<details class="details_divider">
        <summary>selected categories</summary>
        </details>`

    document.getElementById('tag_output').innerHTML = taxon_html;
}
