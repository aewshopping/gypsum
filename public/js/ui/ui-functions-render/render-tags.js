export function renderTags(tagname, tagcount = null) {

    let tagcounter = "";

    if (tagcount != null) {
        tagcounter = `&nbsp;(${tagcount})`;
    }

    return `<code><span class="tag" data-tag="${tagname}" data-action="tag-filter">${tagname}${tagcounter}</span></code> `; // note the (deliberate!) whitespace at the end which seperates the tags when joined together...

}