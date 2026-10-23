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
 * @param {boolean} [fromFrontMatter=false] - Whether the note's `tags:` list holds it, which draws
 *   a bullet inside the pill: the tags the table's tags cell can change. Outside `data-tag`, so
 *   the filter and a copy see the bare name. plans/completed/tag-edit-in-table-view.md §3.2.
 * @returns {string} The HTML string for the rendered tag.
 */
export function renderTags(tagname, tagcount = null, hash = "nohash", type = "tag-pill", active = false, fromFrontMatter = false) {

    let tagcounter = "";

    if (tagcount != null) {
        tagcounter = `&nbsp;(${tagcount})`;
    }

    const name = escapeHtml(tagname);
    const tag_type = type === "span" ? "" : "tag-pill"; // so we can style the tag differently according to where it is used (default is tag-pill style)
    const tagnamehash = (hash === "showhash") ? "#" + name : name; // for when we want to render tags inside the modal, need to show the # in front
    const bullet = fromFrontMatter ? '◦' : '';

    const spanhtml = `<span class="tag ${tag_type}" data-tag="${name}" data-action="tag-filter" data-filterkey="tags-:-${name}" data-active="${active}" data-tip="filter by #${name}">${tagnamehash}${tagcounter}${bullet}</span>`

    return spanhtml;

}

/**
 * One note's tags as pills, a bullet on each its front matter holds — in the same order every view
 * draws them, which is the TagMap's.
 * @param {object} file - The file object, carrying `tags` and `frontMatterTags`.
 * @returns {string} The HTML for the pills.
 */
export function renderNoteTags(file) {
    const inFrontMatter = new Set(file.frontMatterTags.map(tag => tag.toLowerCase().trim()));
    return [...file.tags.keys()]
        .map(tag => renderTags(tag, null, "nohash", "tag-pill", false, inFrontMatter.has(tag)))
        .join('');
}
