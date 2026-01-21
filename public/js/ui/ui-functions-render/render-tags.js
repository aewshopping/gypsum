
// there are lots of arguments so we can render tags that already represent an active filter
export function renderTags(tagname, tagcount = null, hash = "nohash", type = "code", active = false, filterId = "") {

    let tagcounter = "";

    if (tagcount != null) {
        tagcounter = `&nbsp;(${tagcount})`;
    }

    let filterId_data = "";
    if (active) { filterId_data = `data-filterkey="${filterId}"` }

    const tagnamehash = (hash === "showhash") ? "#" + tagname : tagname; // for when we want to render tags inside the modal, need to show the # in front

    const spanhtml = `<span class="tag" data-tag="${tagname}" data-action="tag-filter" ${filterId_data} data-active="${active}">${tagnamehash}${tagcounter}</span>`;

    const codehtml = `<code>${spanhtml}</code> `; // note the (deliberate!) whitespace at the end which seperates the tags when joined together...

    if (type === "span") {
        return spanhtml;
    } else {
        return codehtml;
    }
}