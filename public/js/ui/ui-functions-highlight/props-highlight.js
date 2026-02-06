import { appState } from "../../services/store.js";
import { searchContainer } from "./treewalker-highlight.js";

/**
 * Updates CSS Custom Highlights for properties based on active filters.
 * It clears existing highlights and then iterates through specified elements,
 * searching for matches based on active filter properties and search values.
 * @param {string[]} elementIds - An array of element IDs to search for highlights within.
 * @returns {void}
 */
export function updatePropHighlights(elementIds) {
    // Clear all existing highlights for a fresh start
    CSS.highlights.clear();

    const allRanges = [];

    const filterMap = appState.search.filters;

    // search each element passed in the parameter (which is an array of elements)
    elementIds.forEach(id => {

        const rootElement = document.getElementById(id);
        if (!rootElement) return; // if elem doesn't exist skip to next

        filterMap.forEach((filter, filterId) => {

            if (filter.active === false) return; // only highlight active filters, skip if active:false
            if (filter.property === "tags") return; // tags highlighted elsewhere, skip if property:tags

            // if using special prop allProperties need to highlight **every** elem with data-prop... except where data-prop="content". If not allProperties just use current property for data-prop selector.
            const selector = filter.property === 'allProperties'
                ? '[data-prop]:not([data-prop="content"])'
                : `[data-prop="${filter.property}"]`;

            const containers = rootElement.querySelectorAll(selector);

            // ensures that you get the parent elem as well as all the children and descendents
            const targetContainers = rootElement.matches(selector)
                ? [rootElement, ...containers]
                : containers;

            targetContainers.forEach(container => {
                searchContainer(container, filter.searchValue, allRanges);
            });
        });
    });

    // if we have found matches the allRanges array will have been updated, so if content in array add to CSS.highlights
    if (allRanges.length > 0) {
        const highlight = new Highlight(...allRanges);
        CSS.highlights.set('match', highlight);
    }
}