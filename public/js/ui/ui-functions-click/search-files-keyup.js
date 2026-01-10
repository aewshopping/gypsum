import { appState } from '../../services/store.js';
import { updateMyFilesShowState } from '../ui-functions-search/filter-files.js';
import { getStringTokens } from '../ui-functions-search/search-tokenise-string.js';

const DEBOUNCE_DELAY_MS = 200;
export const debouncedSearchHandler = debounce(handleSearchFiles, DEBOUNCE_DELAY_MS);

/**
 * Creates a debounced version of a function that delays its execution until after a specified wait time
 * has elapsed since the last time it was invoked.
 * @param {Function} func The function to debounce.
 * @param {number} delay The number of milliseconds to delay.
 * @returns {Function} Returns the new debounced function.
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
 * Handles the logic for searching files based on user input from a search box.
 * It validates the search term length, tokenizes the string, updates the application state,
 * and triggers a re-render of the file list. This function is debounced to prevent
 * excessive re-rendering during rapid typing.
 * @param {Event} event - The keyup event object from the search input field.
 */
function handleSearchFiles(event) {
    // 1. Get the current search term and convert to lowercase for case-insensitive matching
    const searchTerm = event.target.value.toLowerCase().trim();
    const minLength = 3;
    const stringLengthOk = validateString(searchTerm, minLength); // also testing where we are searching a prop with "property:value", here value must be >= min length

    // --- Logic for when the search term is long enough and array exists ---
    if (stringLengthOk && appState.myFiles.length > 0) {

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

/**
 * Validates a search string based on a minimum length requirement.
 * If the string contains a colon (':'), it checks that the part *after* the colon
 * meets the minimum length. Otherwise, it checks the entire string's length.
 * @param {string} s The search string to validate.
 * @param {number} x The minimum required length.
 * @returns {boolean} True if the string is valid, false otherwise.
 */
function validateString(s, x) {
  // Check 1: Total length < x
  if (s.length < x) return false;

  const i = s.indexOf(':');

  // Check 2: If no colon then i = -1 so true. OR: if colon i <> -1, but IF string length after colon >= x then true.
  return i === -1 || (s.length - (i + 1)) >= x;
}