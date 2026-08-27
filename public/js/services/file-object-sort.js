// javascript
import { appState } from './store.js';

/**
 * Converts a date string into a numerical timestamp.
 * @param {string | Date} dateValue The date string or Date object to convert.
 * @returns {number} The numerical timestamp (milliseconds since epoch) or NaN if invalid.
 */
function getTimestamp(dateValue) {
    if (dateValue === null || dateValue === undefined || dateValue === '') {
        // Treat empty string ('') as missing data for dates
        return NaN;
    }
    // Date constructor handles the parsing; getTime() returns milliseconds or NaN if invalid.
    return new Date(dateValue).getTime();
}

/**
 * Builds a comparator for objects carrying `property`, for use with Array.sort().
 * Missing or invalid data (null, undefined, empty strings, invalid dates) is consistently
 * moved to the end, regardless of sort order.
 *
 * Separate from sortAppStateFiles so the same type-aware, null-safe comparison can order
 * any list of objects — the history overview sorts its rows with it too.
 *
 * @param {string} property The name of the property to sort by.
 * @param {string} dataType The data type of the property ('string', 'number', 'date', 'array').
 * @param {string} [sortOrder='asc'] The sort order, either 'asc' for ascending or 'desc' for descending.
 * @returns {(a: object, b: object) => number} Comparator function.
 */
export function compareByProperty(property, dataType, sortOrder = 'asc') {
    // Determines direction: 1 for 'asc', -1 for 'desc'
    const orderMultiplier = (sortOrder === 'desc' ? -1 : 1);

    return (a, b) => {
        const valA = a[property];
        const valB = b[property];
        
        let comparison = 0;

        // --- 1. Normalized Value Retrieval ---
        let normA, normB;
        
        switch (dataType) {
            case 'date':
                // Use helper to handle null/undefined/empty string and Invalid Date strings, normalizing them to NaN
                normA = getTimestamp(valA);
                normB = getTimestamp(valB);
                break;
            default:
                // For all other types, null/undefined/empty string are considered 'missing'
                normA = valA;
                normB = valB;
                break;
        }

        // --- 2. Consistent Missing Data Check (Nulls/Undefineds/Empty Strings/NaN go to the end) ---
        
        // Helper function to check for missing/invalid data, including empty strings for non-date types
        const isMissing = (value, type) => {
            // Check for explicit missing values
            if (value === null || value === undefined) return true;
            
            // Check for empty string specifically
            if (typeof value === 'string' && value === '') return true; 

            // Check for invalid date (NaN timestamp)
            if (type === 'date' && isNaN(value)) return true;
            
            return false;
        };

        const isMissingA = isMissing(normA, dataType);
        const isMissingB = isMissing(normB, dataType);

        if (isMissingA && isMissingB) return 0; // Keep their relative order
        
        // *** CRITICAL CHANGE: Always return 1 or -1 for missing data (NO multiplier) ***
        // 1 means A goes after B (A to the end)
        if (isMissingA) return 1; 
        
        // -1 means A goes before B (B to the end)
        if (isMissingB) return -1; 

        // --- 3. Data Type Value Comparison (Only for valid values) ---
        switch (dataType) {
            case 'string':
                // We already handled empty string, so now only compare valid strings.
                // Case- and accent-insensitive sort
                comparison = String(normA).localeCompare(String(normB), undefined, { sensitivity: 'base' });
                break;

            case 'number':
            case 'date':
                // Comparison works for both numbers and date timestamps (non-NaN)
                comparison = normA - normB; 
                break;
                
            case 'array': {
                const sizeA = normA instanceof Map ? normA.size : normA.length;
                const sizeB = normB instanceof Map ? normB.size : normB.length;
                comparison = sizeA - sizeB;
                break;
            }

            default:
                comparison = 0;
                break;
        }

        return comparison * orderMultiplier; // Apply sort direction for valid comparisons
    };
}

/**
 * Sorts the `appState.myFiles` array in place based on a specified property and data type.
 * @param {string} property The name of the property on the file objects to sort by.
 * @param {string} dataType The data type of the property ('string', 'number', 'date', 'array').
 * @param {string} [sortOrder='asc'] The sort order, either 'asc' for ascending or 'desc' for descending.
 */
export function sortAppStateFiles(property, dataType, sortOrder = 'asc') {
    const dataArray = appState.myFiles;

    if (!dataArray || !Array.isArray(dataArray)) {
        console.error("Error: appState.myFiles is not defined or is not an array.");
        return;
    }

    dataArray.sort(compareByProperty(property, dataType, sortOrder));
}