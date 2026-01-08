// javascript
/**
 * Spiders through the DOM, highlights instances of the search string,
 * and clears previous highlights within the specified root element.
 * @param {string} searchString - The text to search for and highlight.
 * @param {string} [elementRoot="body"] - A CSS selector (e.g., '#myId', '.my-class', or 'body') to define the scope of highlighting.
 * @param {string[]} [excludedSelectors=[]] - An array of CSS selector strings (e.g., ['.no-highlight', '#skip-this', 'p'])
 * listing elements to exclude from highlighting. These selectors are appended
 * to the default exclusion list.
 */
export function highlightSearchResults(searchString, elementRoot = "body", excludedSelectors = []) {

    // --- UPDATED PLACEMENT AND ADDITION HERE ---
    // Define elements that should never be processed for text replacement, 
    // as it can corrupt the element's internal structure or presentation.
    const defaultExclusions = 'script, style, textarea, pre, code, svg';
    // ---------------------------------------------

    const root = document.querySelector(elementRoot);

    if (!root) {
        console.error(`Root element not found for selector: ${elementRoot}`);
        return;
    }
    // ------------------------------------------------------------------

    // 1. Clear existing <mark> highlights ONLY within the specified root.
    root.querySelectorAll('mark').forEach(mark => {
        mark.replaceWith(...mark.childNodes);
    });
    // ------------------------------------------------------------------

    if (!searchString || searchString.trim() === '') {
        return;
    }

    // 2. Prepare the regular expression, escape any regex characters
    const escapedSearchString = searchString.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${escapedSearchString})`, 'gi');
    const replaceTemplate = '<mark>$1</mark>';

    // console.log("highlighting");
    // 3. Set up the TreeWalker
    const nodesToReplace = [];

    // Combine the default exclusions with the user-provided selectors
    const customExclusionSelector = excludedSelectors.join(', '); 
    
    const combinedExclusions = customExclusionSelector
        ? `${defaultExclusions}, ${customExclusionSelector}`
        : defaultExclusions;


    // Use a custom filter to ensure we only target valid text nodes
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                const parent = node.parentElement;

                // Check if the parent matches ANY of the combined exclusion selectors
                if (parent && parent.matches(combinedExclusions)) {
                    return NodeFilter.FILTER_SKIP;
                }

                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );
    // --------------------------------------------------------------------------

    let node;
    while (node = walker.nextNode()) {
        nodesToReplace.push(node);
    }

    // 4. Replace Text Nodes with highlighted content (Unchanged logic)
    nodesToReplace.forEach(textNode => {
        const originalText = textNode.nodeValue;
        const replacedHTML = originalText.replace(regex, replaceTemplate);

        if (originalText === replacedHTML) {
            return;
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = replacedHTML;
        const fragment = document.createDocumentFragment();

        while (tempDiv.firstChild) {
            fragment.appendChild(tempDiv.firstChild);
        }

        textNode.replaceWith(fragment);
    });
}