// javascript
import { appState } from './store.js';

/**
 * Converts a date string into a numerical timestamp.
 * Returns NaN if the input is missing or results in an Invalid Date.
 */
function getTimestamp(dateValue) {
    if (dateValue === null || dateValue === undefined) {
        return NaN;
    }
    // Date constructor handles the parsing; getTime() returns milliseconds or NaN if invalid.
    return new Date(dateValue).getTime();
}

/**
 * Sorts the appState.myFiles array based on a property, ensuring null/undefined/invalid data 
 * is consistently sorted to the end of the array.
 */
export function sortAppStateFiles(property, dataType, sortOrder = 'asc') {
    const dataArray = appState.myFiles;

    if (!dataArray || !Array.isArray(dataArray)) {
        console.error("Error: appState.myFiles is not defined or is not an array.");
        return;
    }

    // Determines direction: 1 for 'asc', -1 for 'desc'
    const orderMultiplier = (sortOrder === 'desc' ? -1 : 1);

    dataArray.sort((a, b) => {
        const valA = a[property];
        const valB = b[property];
        
        let comparison = 0;

        // --- 1. Normalized Value Retrieval ---
        let normA, normB;
        
        switch (dataType) {
            case 'date':
                // Use helper to handle null/undefined and Invalid Date strings, normalizing them to NaN
                normA = getTimestamp(valA);
                normB = getTimestamp(valB);
                break;
            default:
                // For all other types, null/undefined is the only 'missing' state
                normA = valA;
                normB = valB;
                break;
        }

        // --- 2. Consistent Missing Data Check (Nulls/Undefineds/NaN go to the end) ---
        const isMissingA = normA === null || normA === undefined || (dataType === 'date' && isNaN(normA));
        const isMissingB = normB === null || normB === undefined || (dataType === 'date' && isNaN(normB));

        if (isMissingA && isMissingB) return 0;
        if (isMissingA) return 1 * orderMultiplier;  // B is valid, A is missing: B wins (A goes to end)
        if (isMissingB) return -1 * orderMultiplier; // A is valid, B is missing: A wins (B goes to end)

        // --- 3. Data Type Value Comparison (Only for valid values) ---
        switch (dataType) {
            case 'string':
                // Case- and accent-insensitive sort
                comparison = normA.localeCompare(normB, undefined, { sensitivity: 'base' });
                break;

            case 'number':
            case 'date':
                // Comparison works for both numbers and date timestamps
                comparison = normA - normB; 
                break;
                
            case 'array':
                comparison = normA.length - normB.length;
                break;

            default:
                comparison = 0;
                break;
        }

        return comparison * orderMultiplier;
    });
}
