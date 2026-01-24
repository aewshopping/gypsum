

/**
 * Searches a container element for a search term and adds the ranges of any matches to an array.
 *
 * @param {HTMLElement} container The container element to search.
 * @param {string} searchTerm The term to search for.
 * @param {Array<Range>} ranges An array to store the ranges of any matches.
 */
export function searchContainer(container, searchTerm, ranges) {
    // Safety check: if there's no search term, there's nothing to find
    if (!searchTerm || searchTerm === "") return;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
        findRangesInNode(node, searchTerm, ranges);
    }
}

/**
 * Finds all occurrences of a search term in a text node and adds the ranges to an array.
 *
 * @param {Node} node The text node to search.
 * @param {string} searchTerm The term to search for.
 * @param {Array<Range>} ranges An array to store the ranges of any matches.
 */
function findRangesInNode(node, searchTerm, ranges) {
    const text = node.nodeValue;
// Check if node has text content
    if (!text) return;

    const lowerText = text.toLowerCase();
    const lowerSearch = searchTerm.toLowerCase();

    let start = 0;
    while ((start = lowerText.indexOf(lowerSearch, start)) !== -1) {
        const range = new Range();
        range.setStart(node, start);
        range.setEnd(node, start + searchTerm.length);
        ranges.push(range);
        
        start += searchTerm.length;
    }
}