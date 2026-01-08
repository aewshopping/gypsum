// javascript
/**
 * Spiders through the DOM, highlights instances of the search strings (token values),
 * and clears previous highlights within the specified root element.
 * * @param {string | Array<Object>} input - The text to search for (string) OR an array 
 * of search token objects (from getStringTokens).
 * @param {string} [elementRoot="body"] - A CSS selector to define the scope of highlighting.
 * @param {string[]} [excludedSelectors=[]] - An array of CSS selector strings listing elements to exclude.
 */
export function highlightSearchResults(input, elementRoot = "body", excludedSelectors = []) {

    let tokens;

    // --- INPUT NORMALIZATION ---
    if (Array.isArray(input)) {
        // Case 1: Already a tokens array (from structured search)
        tokens = input;
    } else if (typeof input === 'string' && input.trim() !== '') {
        // Case 2: A simple string was passed. Treat it as a single generic token.
        tokens = [{ type: 'generic', value: input }];
    } else {
        // Case 3: Invalid or empty input
        tokens = [];
    }
    // ----------------------------


    // 1. STREAMLINED TOKEN AGGREGATION
    // Extract non-empty search strings from the normalized tokens array.
    const searchTerms = tokens
        .map(token => token.value)
        .filter(value => value && value.trim() !== '');
    
    const root = document.querySelector(elementRoot);

    if (!root) {
        console.log(`Root element not found for selector: ${elementRoot}`);
        return;
    }

    // Clear existing <mark> highlights
    root.querySelectorAll('mark').forEach(mark => {
        mark.replaceWith(...mark.childNodes);
    });
    
    // Stop if no valid terms are left to highlight
    if (searchTerms.length === 0) {
        return;
    }

    // 2. Prepare the regular expression adding in the token search string at this stage
    
    const escapedTerms = searchTerms.map(term => 
        term.replace(/[-\/\\^$*+?.()|[\]{}]/g, (match) => '\\' + match)
    );

    const regexPattern = `(${escapedTerms.join('|')})`;
    const regex = new RegExp(regexPattern, 'gi');
    const replaceTemplate = '<mark>$1</mark>';
    // ------------------------------------------------------------------

    // 3. Set up the TreeWalker
    const nodesToReplace = [];
    
    const defaultExclusions = 'script, style, textarea, pre, code, svg';
    const customExclusionSelector = excludedSelectors.join(', ');

    const combinedExclusions = customExclusionSelector
        ? `${defaultExclusions}, ${customExclusionSelector}`
        : defaultExclusions;


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

    let node;
    while (node = walker.nextNode()) {
        nodesToReplace.push(node);
    }

    // 4. Replace Text Nodes with highlighted content
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