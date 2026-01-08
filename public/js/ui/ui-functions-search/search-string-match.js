

/**
 * Helper function to check if the file object contains the search string
 * in any non-excluded property. Uses Object.keys().some() for clear, short-circuiting logic.
 * @param {object} file - The file object to search within.
 * @param {string} lowerSearchString - The text string to search for (ALREADY LOWERCASE).
 * @returns {boolean} True if the search string is found, false otherwise.
 */
export function checkStringMatch(file, lowerSearchString) {
    if (!lowerSearchString) return false;

    // Define properties to exclude from the search
    const excludedKeys = ['handle', 'show'];

    return Object.keys(file).some(key => {
        // 1. Check for exclusion and ensure it's a direct property
        if (excludedKeys.includes(key) || !Object.prototype.hasOwnProperty.call(file, key)) {
            return false;
        }
        
        // 2. Perform the case-insensitive search
        const propertyValue = String(file[key]).toLowerCase();
        
        return propertyValue.includes(lowerSearchString);
    });
}