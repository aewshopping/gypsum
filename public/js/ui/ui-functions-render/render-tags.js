import { escapeHtml } from './escape-html.js';

/**
 * Renders a tag as an HTML `<span>` element.
 * Supports various options for showing counts, hashes, and active status.
 *
 * **The name is escaped everywhere it is written.** A body tag is word characters only, but a front
 * matter tag can hold anything — and one typed into the table's tags cell may well hold a quote.
 *
 * @param {string} tagname - The name of the tag.
 * @param {number|null} [tagcount=null] - The optional count of occurrences for the tag.
 * @param {string} [hash="nohash"] - Whether to show a '#' before the tag name ('showhash' or 'nohash').
 * @param {string} [type="tag-pill"] - The type of tag element to render, used for styling ('tag-pill' or 'span').
 * @param {boolean} [active=false] - Whether the tag is currently active as a filter.
 * @returns {string} The HTML string for the rendered tag.
 */
export function renderTags(tagname, tagcount = null, hash = "nohash", type = "tag-pill", active = false) {

    let tagcounter = "";

    if (tagcount != null) {
        tagcounter = `&nbsp;(${tagcount})`;
    }

    const name = escapeHtml(tagname);
    const tag_type = type === "span" ? "" : "tag-pill"; // so we can style the tag differently according to where it is used (default is tag-pill style)
    const tagnamehash = (hash === "showhash") ? "#" + name : name; // for when we want to render tags inside the modal, need to show the # in front

    const spanhtml = `<span class="tag ${tag_type}" data-tag="${name}" data-action="tag-filter" data-filterkey="tags-:-${name}" data-active="${active}" data-tip="filter by #${name}">${tagnamehash}${tagcounter}</span>`

    return spanhtml;

}

/**
 * One note's tags as the table's tags cell draws them: a front matter tag plain, since the cell can
 * change it, and a tag only the note's text holds with a `#` in front, since it is written there and
 * nowhere the cell reaches. A tag in both places is the front matter's. Only the table marks them;
 * every other view draws plain pills. The `#` is outside `data-tag`, so the filter and a copy see
 * the bare name. The TagMap's order, as everywhere. plans/completed/tag-edit-in-table-view.md §3.2.
 * @param {object} file - The file object, carrying `tags` and `frontMatterTags`.
 * @returns {string} The HTML for the pills.
 */
export function renderNoteTags(file) {
    const inFrontMatter = new Set(file.frontMatterTags.map(tag => tag.toLowerCase().trim()));
    return [...file.tags.keys()]
        .map(tag => renderTags(tag, null, inFrontMatter.has(tag) ? "nohash" : "showhash"))
        .join('');
}
