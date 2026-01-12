// **REMOVE LATER** ???

/**
 * Checks if a single file object matches the given search query and properties.
 * * @param {Object} item - A single file object. (NEW ARGUMENT TYPE)
 * @param {string} queryString - The user's input search string.
 * @param {any} genericSearchProps - List of properties to search generically (Map, Object, or Array).
 * @returns {boolean} True if the file matches the query, false otherwise. (NEW RETURN TYPE)
 */

export function checkStringQueryMatch(item, queryString, genericSearchProps) { // RENAMED FUNCTION
    const tokens = queryString;

    // If no search terms, the item always matches.
    if (tokens.length === 0) return true; 

    const searchKeys = normalizeGenericProps(genericSearchProps);
    
    // If there are search terms but no valid keys to search against, it fails.
    if (searchKeys.length === 0) {
        console.warn("No valid generic search properties were derived.");
        return true; // Or return false, depending on desired strictness for an empty key set
    }

    // Implicit AND logic: ALL tokens must return true for the item.
    return tokens.every(token => {

        // --- Case 1: Property-Specific Token ---
        if (token.type === 'property') {
            const itemValue = item[token.property];
            
            if (itemValue === undefined || itemValue === null) return false; 
            return String(itemValue).toLowerCase().includes(token.value);
        }

        // --- Case 2: Generic Token (Uses the normalized searchKeys) ---
        else if (token.type === 'generic') {
            return searchKeys.some(prop => {
                const propValue = item[prop];
                if (propValue === undefined || propValue === null) return false;
                return String(propValue).toLowerCase().includes(token.value);
            });
        }
        
        return false;
    });
}



/**
 * Helper function to convert various input types (Array, Map, Object) 
 * into a standardized Array of property names.
 * @param {Array<string>|Map<string, any>|Object<string, any>} props - Input properties structure.
 * @returns {Array<string>} An array of property keys (strings).
 */
function normalizeGenericProps(props) {
    if (Array.isArray(props)) {
        // Case 1: Already an Array
        return props;
    } else if (props instanceof Map) {
        // Case 2: A true JavaScript Map object
        return Array.from(props.keys());
    } else if (typeof props === 'object' && props !== null) {
        // Case 3: A standard JavaScript object
        return Object.keys(props);
    } 
    return [];
}