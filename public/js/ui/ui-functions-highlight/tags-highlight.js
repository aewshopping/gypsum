

export function tagsHighlight(tagName, status, key="") {

    // Selects elements where the data-tag attribute matches the tagName variable
    const tagElems = document.querySelectorAll(`[data-tag="${tagName}"]`);

    for (const tagElem of tagElems) {

        tagElem.dataset.active = status.toString(); // activates / deactivates the css styling based on data-active=true

    }
}
