import { appState } from '../../services/store.js';
import { updateMyFilesShowState } from '../ui-functions-search/filter-files.js';
import { getStringTokens } from '../ui-functions-search/search-tokenise-string.js';

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

    // --- Logic for when the search term is long enough and array exists ---
    if (searchTerm.length >= minLength && appState.myFiles.length > 0) {

        appState.filterString = getStringTokens(searchTerm); // saved so don't have to recalc later plus to use by highlight function 

        updateMyFilesShowState();


    } else {
        // If the search term is empty or too short, reset all files to show=true.
        if (appState.myFiles.length > 0) {

            appState.filterString = "";

            updateMyFilesShowState();

            
        } else {
          //  console.log(`No files loaded) so not searching yet.`);
        }
    }

}
