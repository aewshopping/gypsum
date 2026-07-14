import { addFilterThenFindMatches } from "../ui-functions-search/a-search-orchestrator.js";
import { parseSearchString } from "../ui-functions-search/a-search-parse-string.js";

/**
 * Handles clicking an array value in the frontmatter Properties panel, triggering a search
 * filter for that property:value pair — the same syntax and pathway the search box uses.
 * Does not touch the open file-content modal; the file list re-renders underneath it.
 * @param {Event} evt - The click event.
 * @param {HTMLElement} target - The clicked element, carrying data-property and data-value.
 * @returns {Promise<void>}
 */
export async function handlePropertyFilterClick(evt, target) {
    const property = target.dataset.property;
    const value = target.dataset.value;

    if (!property || !value) {
        console.error("Clicked element does not have data-property/data-value.");
        return;
    }

    const searchObject = parseSearchString(value, property);
    await addFilterThenFindMatches(searchObject);
}
