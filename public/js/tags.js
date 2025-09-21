import { state } from './state.js';
import { TAG_JOINER } from './constants.js';

export function processTags() {
    // STUFF HAPPENS HERE AFTER ALL FILES LOAD, above is evt handlers
    ///////////// START Build up tag data /////////////
    state.data_tags.sort();

    // count how instances of each item in array and return as object of unique names and count
    const occurrences = state.data_tags.reduce((acc, curr) => {
        acc[curr] = (acc[curr] || 0) + 1;
        return acc;
    }, {});

    // turn back into two arrays, one for tag name and the other for count values
    const uniqueTags = Object.keys(occurrences); // names only
    const data_tags_freq = uniqueTags.map(key => [key, occurrences[key]]); // names and values

    // create html to show all tags
    let data_tags_html = data_tags_freq.map(tag_freq =>
        `<code><span class='tag ${tag_freq[0]}'>${tag_freq[0]}&nbsp;(${tag_freq[1]})</span></code>`
    );
    ///////////// END Build up tag data /////////////

    ///////////// START Build up tag taxonomy data /////////////
    state.taxon_array.sort();

    // change taxonomy array to a better shape we can iterate over
    const objtemp = {};
    for (const [parent, child] of state.taxon_array) {
        if (!objtemp[parent]) {
            objtemp[parent] = [];
        }
        // only push if parent child not already included
        if (!objtemp[parent].includes(child)) {
            objtemp[parent].push(child);
        }
    }

    // Flatten the values of objtemp into a single array
    const objtemp_values = Object.values(objtemp).flat();
    // Find items in data_tags that are not present in objtemp_values
    const newItems = uniqueTags.filter(item => !objtemp_values.includes(item));
    // Add the new items to objtemp under a new key
    if (newItems.length > 0) {
        objtemp.orphan_tags = newItems;
    }

    // create array from the object above for tag taxonomy
    let taxon_array_filter = Object.entries(objtemp).map(([parent, children]) => [parent, children]);

    // use the count tags info derived above to add a tag frequency array. generated this using google gemini so the ?.[1] ?? null is an incantation to me
    let taxon_array_freq = taxon_array_filter.map(([taxon, tags]) => {
        const freqs = tags.map(name => {
            const found = data_tags_freq.find(([tag]) => tag === name);
            return found ? found[1] : null;
        });
        return [taxon, tags, freqs];
    });

    let taxonomy_html = [];
    for (let r = 0; r < taxon_array_freq.length; r++) {
        let taxonomy_tags = [];
        taxonomy_html.push(`<details class="taxon"><summary><code>${taxon_array_freq[r][0]}</code></summary>`);
        for (let s = 0; s < taxon_array_freq[r][1].length; s++) {
            taxonomy_tags[s] = `<code><span class='tag ${taxon_array_freq[r][1][s]}'>${taxon_array_freq[r][1][s]}\u00A0(${taxon_array_freq[r][2][s]})</span></code>`;
        }
        let taxonomy_tag_string = taxonomy_tags.join(TAG_JOINER);
        taxonomy_html.push(taxonomy_tag_string);
        taxonomy_html.push(`</details>`);
    }
    taxonomy_html.push(`<details class="details_divider"><summary>selected categories</summary></details>`);
    ///////////// END Build up tag taxonomy data /////////////

    // put all tags at top of the page
    let data_tags_string = data_tags_html.join(TAG_JOINER);
    taxonomy_html.push(`<details class="taxon"><summary><code>all tags</code></summary>`);
    taxonomy_html.push(data_tags_string);

    return taxonomy_html.join("");
}
