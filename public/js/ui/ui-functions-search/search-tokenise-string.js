
// --- REGEX CONSTANTS ---
const PROP_ID = `(\\w+)`; 
const QUOTED_VALUE = `\"(.*?)\"`;
const SINGLE_WORD_VALUE = `(\\w+)`; 

// --- REGEX PATTERN PARTS ---
const PROP_QUOTED_PATTERN = `${PROP_ID}:${QUOTED_VALUE}`; 
const PROP_WORD_PATTERN = `${PROP_ID}:${SINGLE_WORD_VALUE}`;

// --- GENERIC PATTERNS ---
// D. Generic Quoted Phrase (e.g., "asset value")
// This is now an independent pattern to ensure it gets matched first if present.
const GENERIC_QUOTED_PATTERN = QUOTED_VALUE; // Group 5
// E. Generic Single Word (e.g., london)
const GENERIC_WORD_PATTERN = SINGLE_WORD_VALUE; // Group 6
// Note: We need to use group indices 5 and 6 later for these.

// --- FINAL REGEX CONSTRUCTION ---
// Crucial: The order of patterns matters for alternation (|).
// We place the generic quoted phrase pattern early to prioritize it over generic single words.
const FULL_REGEX_PATTERN = `${PROP_QUOTED_PATTERN}|${PROP_WORD_PATTERN}|${GENERIC_QUOTED_PATTERN}|${GENERIC_WORD_PATTERN}`;
const FULL_REGEX = new RegExp(FULL_REGEX_PATTERN, 'g');


/**
 * Parses a search string into structured tokens (property-specific or generic).
 * @param {string} queryString - The user's input search string.
 * @returns {Array<Object>} An array of token objects.
 */
export function getStringTokens(queryString) {
    const tokens = [];

    let match;
    // We use the exec method in a loop to iterate through all matches
    while ((match = FULL_REGEX.exec(queryString))) {
        
        // --- 1. Property Tokens ---
        
        // Match 1: property:"quoted phrase" (Groups 1 & 2)
        if (match[1] && match[2]) {
            tokens.push({ 
                type: 'property', 
                property: match[1].toLowerCase(), 
                value: match[2].toLowerCase() 
            });
        // Match 2: property:singleword (Groups 3 & 4)
        } else if (match[3] && match[4]) {
            tokens.push({ 
                type: 'property', 
                property: match[3].toLowerCase(), 
                value: match[4].toLowerCase() 
            });
        
        // --- 2. Generic Tokens ---
        
        // Match 3: generic "quoted phrase" (Group 5) OR generic singleword (Group 6)
        // Group 5 is the value from the generic quoted phrase match
        // Group 6 is the value from the generic single word match
        } else if (match[5] || match[6]) {
            const value = (match[5] || match[6]).toLowerCase();
            tokens.push({ type: 'generic', value: value });
        }
    }
    
    // Reset the regex index for future runs
    FULL_REGEX.lastIndex = 0;

    return tokens.filter(t => t.value && t.value.trim().length > 0);
}


