
// there are lots of arguments so we can render tags that already represent an active filter
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