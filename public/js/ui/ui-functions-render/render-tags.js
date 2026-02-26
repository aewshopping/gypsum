
/**
 * Renders a tag as an HTML `<span>` element.
 * Supports various options for showing counts, hashes, and active status.
 * @function renderTags
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

    const tag_type = type === "span" ? "" : "tag-pill"; // so we can style the tag differently according to where it is used (default is tag-pill style)
    const tagnamehash = (hash === "showhash") ? "#" + tagname : tagname; // for when we want to render tags inside the modal, need to show the # in front
    
    const spanhtml = `<span class="tag ${tag_type}" data-tag="${tagname}" data-action="tag-filter" data-filterkey="tags-:-${tagname}" data-active="${active}">${tagnamehash}${tagcounter}</span>`

    return spanhtml;

}