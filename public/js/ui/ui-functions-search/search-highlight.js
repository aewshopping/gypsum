// **REMOVE LATER** ???

/**
 * Spiders through the DOM, highlights instances of the search strings (token values),
 * respecting the data-prop attribute for property-specific tokens in ancestors.
 * * * @param {string | Array<Object>} input - The text to search for (string) OR an array 
 * of search token objects (from getTwoTypeTokens).
 * @param {string} [elementRoot="body"] - A CSS selector to define the scope of highlighting.
 * @param {string[]} [excludedSelectors=[]] - An array of CSS selector strings listing elements to exclude.
 */
export function highlightSearchResults(input, elementRoot = "body", excludedSelectors = []) {

    let tokens;
    let propertyTokenMap = new Map();
    let genericTerms = [];

    // --- 1. INPUT NORMALIZATION AND TOKEN AGGREGATION ---
    if (Array.isArray(input)) {
        tokens = input;
    } else if (typeof input === 'string' && input.trim() !== '') {
        // Simple string input is treated as a single generic token
        tokens = [{ type: 'generic', value: input }];
    } else {
        tokens = [];
    }
    
    // Aggregate terms into a Generic list and a Property Map for easy lookup
    tokens.forEach(token => {
        // Escape any special regex characters in the term value
        const escapedTerm = token.value.replace(/[-\/\\^$*+?.()|[\]{}]/g, (match) => '\\' + match);

        if (token.type === 'property') {
            const propKey = token.property;
            if (!propertyTokenMap.has(propKey)) {
                propertyTokenMap.set(propKey, []);
            }
            propertyTokenMap.get(propKey).push(escapedTerm);
        } else {
            // All generic terms are added to a single list
            genericTerms.push(escapedTerm);
        }
    });
    
    // Create the global generic pattern (only needs to be built once)
    const genericRegexPattern = genericTerms.length > 0 
        ? `(${genericTerms.join('|')})` 
        : null;
    // --------------------------------------------------------

    const root = document.querySelector(elementRoot);
    if (!root) {
        console.error(`Root element not found for selector: ${elementRoot}`);
        return;
    }

    // Clear existing <mark> highlights
    root.querySelectorAll('mark').forEach(mark => {
        mark.replaceWith(...mark.childNodes);
    });
    
    // Stop if no valid terms are left to highlight
    if (genericTerms.length === 0 && propertyTokenMap.size === 0) {
        return;
    }

    // 2. Set up the TreeWalker (unchanged)
    const nodesToReplace = [];
    const defaultExclusions = 'script, style, textarea, pre, code, svg';
    const combinedExclusions = excludedSelectors.length 
        ? `${defaultExclusions}, ${excludedSelectors.join(', ')}`
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

    // 3. Conditional Replacement Logic
    nodesToReplace.forEach(textNode => {
        const originalText = textNode.nodeValue;
        const parent = textNode.parentElement;
        
        // --- Traverse up to find the element with data-prop ---
        const propElement = parent ? parent.closest('[data-prop]') : null;
        const propKey = propElement ? propElement.dataset.prop : null;
        // --------------------------------------------------------
        
        let combinedPatterns = [];
        
        // A. Always check for generic terms
        if (genericRegexPattern) {
            combinedPatterns.push(genericRegexPattern);
        }

        // B. Check for property-specific terms ONLY if data-prop is found and matches
        if (propKey && propertyTokenMap.has(propKey)) {
            const propTerms = propertyTokenMap.get(propKey).join('|');
            // Wrap in parentheses for the OR operation
            combinedPatterns.push(`(${propTerms})`); 
        }

        if (combinedPatterns.length === 0) {
            return; // Nothing to highlight in this specific node
        }

        // Build the local regex for this node
        const localRegexPattern = combinedPatterns.join('|');
        const localRegex = new RegExp(localRegexPattern, 'gi');
        const replaceTemplate = '<mark>$1</mark>';
        
        // Perform the replacement
        const replacedHTML = originalText.replace(localRegex, replaceTemplate);

        if (originalText === replacedHTML) {
            return;
        }
        
        // 4. Standard DOM replacement
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = replacedHTML;
        const fragment = document.createDocumentFragment();

        while (tempDiv.firstChild) {
            fragment.appendChild(tempDiv.firstChild);
        }

        textNode.replaceWith(fragment);
    });
}