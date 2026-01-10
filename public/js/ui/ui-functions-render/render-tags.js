/**
 * Renders an HTML string for a single tag element.
 * It creates a clickable tag with an optional count displayed next to it.
 * @param {string} tagname The name of the tag to render.
 * @param {number|null} [tagcount=null] The number of occurrences of the tag. If provided, it will be displayed.
 * @returns {string} The generated HTML string for the tag.
 */
export function renderTags(tagname, tagcount = null) {

    let tagcounter = "";

    if (tagcount != null) {
        tagcounter = `&nbsp;(${tagcount})`;
    }

    return `<code><span class="tag" data-tag="${tagname}" data-action="tag-filter">${tagname}${tagcounter}</span></code> `; // note the (deliberate!) whitespace at the end which seperates the tags when joined together...

}