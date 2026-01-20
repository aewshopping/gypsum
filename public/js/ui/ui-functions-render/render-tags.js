export function renderTags(tagname, tagcount = null, type="code") {

    let tagcounter = "";

    if (tagcount != null) {
        tagcounter = `&nbsp;(${tagcount})`;
    }

    const tagnamehash = (type === "span") ? "#" + tagname : tagname; // for when we want to render tags inside the modal, need to show the # in front

    const spanhtml = `<span class="tag" data-tag="${tagname}" data-action="tag-filter" data-active="false">${tagnamehash}${tagcounter}</span>`;

    const codehtml = `<code>${spanhtml}</code> `; // note the (deliberate!) whitespace at the end which seperates the tags when joined together...

    if (type==="span") {
        return spanhtml;
    } else {
    return codehtml;
    }
}