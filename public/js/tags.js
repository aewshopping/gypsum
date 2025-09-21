import { state } from './state.js';
import { TAG_JOINER } from './constants.js';

export function processTags() {
    state.data_tags.sort();

    const occurrences = state.data_tags.reduce((acc, curr) => {
        acc[curr] = (acc[curr] || 0) + 1;
        return acc;
    }, {});

    const uniqueTags = Object.keys(occurrences);
    const data_tags_freq = uniqueTags.map(key => [key, occurrences[key]]);

    let data_tags_html = data_tags_freq.map(tag_freq =>
        `<code><span class='tag ${tag_freq[0]}'>${tag_freq[0]}&nbsp;(${tag_freq[1]})</span></code>`
    );

    state.taxon_array.sort();

    const objtemp = {};
    for (const [parent, child] of state.taxon_array) {
        if (!objtemp[parent]) {
            objtemp[parent] = [];
        }
        if (!objtemp[parent].includes(child)) {
            objtemp[parent].push(child);
        }
    }

    const objtemp_values = Object.values(objtemp).flat();
    const newItems = uniqueTags.filter(item => !objtemp_values.includes(item));
    if (newItems.length > 0) {
        objtemp.orphan_tags = newItems;
    }

    let taxon_array_filter = Object.entries(objtemp).map(([parent, children]) => [parent, children]);

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

    let data_tags_string = data_tags_html.join(TAG_JOINER);
    taxonomy_html.push(`<details class="taxon"><summary><code>all tags</code></summary>`);
    taxonomy_html.push(data_tags_string);

    return taxonomy_html.join("");
}
