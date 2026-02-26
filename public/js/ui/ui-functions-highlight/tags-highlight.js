

/**
 * Toggles the highlight state of tag elements.
 * Finds all elements with a `data-tag` attribute matching the given `tagName`
 * and sets their `data-active` attribute to the specified status.
 *
 * @function tagsHighlight
 * @param {string} tagName The name of the tag to highlight.
 * @param {string} status The status to set ('true' or 'false').
 * @param {string} [key=""] - An optional key (currently unused).
 */
export function tagsHighlight(tagName, status, key="") {

    // Selects elements where the data-tag attribute matches the tagName variable
    const tagElems = document.querySelectorAll(`[data-tag="${tagName}"]`);

    for (const tagElem of tagElems) {

        tagElem.dataset.active = status.toString(); // activates / deactivates the css styling based on data-active=true

    }
}
