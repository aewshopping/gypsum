// javascript
/**
 * Spiders through the DOM, highlights instances of the search string,
 * and clears previous highlights within the specified root element.
 * @param {string} searchString - The text to search for and highlight.
 * @param {string} [elementRoot="body"] - A CSS selector (e.g., '#myId', '.my-class', or 'body') to define the scope of highlighting.
 * @param {string[]} [excludeClasses=[]] - An array of class names to exclude from highlighting.
 */
export function highlightSearchResults(searchString, elementRoot = "body", excludeClasses = []) {
    
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

    // 3. Set up the TreeWalker
    const nodesToReplace = [];
    
    const defaultExclusions = 'script, style, textarea, pre, code';
    const classExclusionSelector = excludeClasses.map(c => `.${c}`).join(', ');
    const combinedExclusions = classExclusionSelector 
        ? `${defaultExclusions}, ${classExclusionSelector}` 
        : defaultExclusions;

    // Use a custom filter to ensure we only target valid text nodes
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                const parent = node.parentElement;
                
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