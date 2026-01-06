import { appState } from '../../services/store.js';
import { renderData } from '../ui-functions-render/render-all-files.js';

const DEBOUNCE_DELAY_MS = 200;
export const debouncedSearchHandler = debounce(handleSearchFiles, DEBOUNCE_DELAY_MS);

/**
 * Debounces a function call, ensuring it is only executed once 
 * after a specified delay since the last time it was called.
 */
function debounce(func, delay) {
    let timeoutId;
    // The wrapper function receives all arguments (including the event object)
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            // Apply the original function with the arguments received from the last keyup event
            func.apply(this, args);
        }, delay);
    };
}

/**
 * Executes the file search logic. 
 * This function is the one that gets debounced.
 * @param {Event} event - The keyup event object.
 */
function handleSearchFiles(event) {
    // 1. Get the current search term and convert to lowercase for case-insensitive matching
    const searchTerm = event.target.value.toLowerCase().trim();
    const minLength = 3;

    // Define properties to exclude from the search
    const excludedKeys = ['handle', 'show'];

    // --- Logic for when the search term is long enough and array exists ---
    if (searchTerm.length >= minLength && appState.myFiles.length > 0) {
        console.log(`--- Searching for: "${searchTerm}" (Actual search executed) ---`);

        // Iterate over each file object in the array
        appState.myFiles.forEach(file => {
            let matchFound = false;

            // Loop through each property (key) in the current file object
            for (const key in file) {
                // Check if the property is a direct property of the object (not inherited) and if the property key is NOT in our excluded list
                if (Object.prototype.hasOwnProperty.call(file, key) && !excludedKeys.includes(key)) {

                    // Check if the property value (converted to string and lowercase contains the search term.
                    const propertyValue = String(file[key]).toLowerCase();

                    if (propertyValue.includes(searchTerm)) {
                        matchFound = true;
                        // Break the inner loop (for keys) since a match was found for this file.
                        break;
                    }
                }
            }

            // 3. Update the 'show' property based on the match result
            file.show = matchFound;
        });

        console.log(`Search for: "${searchTerm}", in object properties, setting show to true where found.`);

        renderData(false);

    } else {
        // If the search term is empty or too short, reset all files to show=true.
        // TODO think about how this should integrate with tag selection!
        if (appState.myFiles.length > 0) {
            console.log(`Search term too short at (${searchTerm.length} chars). Setting visibility on all files to true.`);
            appState.myFiles.forEach(file => {
                file.show = true;
            });
            renderData(false);
        } else {
            console.log(`No files loaded) so not searching yet.`);
        }
    }
}