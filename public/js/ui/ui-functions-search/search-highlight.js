// javascript
/**
 * Spiders through the DOM, highlights instances of the search string,
 * and clears previous highlights.
 * * @param {string} searchString - The text to search for and highlight.
 */
export function highlightSearchResults(searchString) {
    // 1. Clear existing <mark> highlights
    // This is crucial if the function is called repeatedly with different search terms.
    document.querySelectorAll('mark').forEach(mark => {
        // Replace the mark element with its own contents (unwrapping it)
        mark.replaceWith(...mark.childNodes);
    });

    if (!searchString || searchString.trim() === '') {
        return;
    }

    // 2. Prepare the regular expression for case-insensitive and global matching
    // Escape special regex characters in the search string
    const escapedSearchString = searchString.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    // The capture group ( ) is essential for the $1 replacement
    const regex = new RegExp(`(${escapedSearchString})`, 'gi');
    const replaceTemplate = '<mark>$1</mark>';

    // 3. Set up the TreeWalker
    // We target only the body, which should contain all rendered page content.
    const root = document.body;

    // Collect text nodes that need modification
    const nodesToReplace = [];

    // Use a custom filter to ensure we only target valid text nodes
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT, // Only interested in Text Nodes
        {
            acceptNode: function(node) {
                // Skip if the parent element is a script, style, textarea, pre, or code block
                // (These contain raw data that should not be manipulated)
                const parent = node.parentElement;
                if (parent && parent.matches('script, style, textarea, pre, code')) {
                    return NodeFilter.FILTER_SKIP;
                }
                
                // Only accept nodes that contain the search string
                if (regex.test(node.nodeValue)) {
                    return NodeFilter.FILTER_ACCEPT;
                }
                
                return NodeFilter.FILTER_SKIP;
            }
        }
    );

    let node;
    while (node = walker.nextNode()) {
        nodesToReplace.push(node);
    }

    // 4. Replace Text Nodes with highlighted content
    nodesToReplace.forEach(textNode => {
        // Create a temporary element to parse the HTML string
        const tempDiv = document.createElement('div');
        
        // Replace the matched text with the <mark> wrapped version
        const replacedHTML = textNode.nodeValue.replace(regex, replaceTemplate);

        tempDiv.innerHTML = replacedHTML;

        // Create a DocumentFragment to hold the new DOM structure (for performance)
        const fragment = document.createDocumentFragment();

        // Append the children of the temporary div (which are the new nodes) to the fragment
        // This moves the nodes, emptying the tempDiv
        while (tempDiv.firstChild) {
            fragment.appendChild(tempDiv.firstChild);
        }

        // Replace the original text node with the fragment
        textNode.replaceWith(fragment);
    });
}