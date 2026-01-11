import { appState } from "../../services/store.js";

/**
 * Reads the content of all file handles in parallel and runs a search handler
 * on each file's content.
 *
 * @param {object} appState - The application state containing the myFiles array.
 * @param {function} debouncedSearchHandler - The function to call with the content of each file.
 * @returns {Promise<Array<any>>} A promise that resolves with an array of the results 
 * from the debouncedSearchHandler for each file.
 */
export async function searchAllFileContent() {
    if (!appState.myFiles || appState.myFiles.length === 0) {
        console.warn("appState.myFiles is empty or undefined. No files to search.");
        return [];
    }

    // 1. Create an array of Promises for concurrent file reading.
    const readPromises = appState.myFiles.map(async fileObject => {
        try {
            // Define your required parameters here
            const MAX_SNIPPETS = 5; 
            const SNIPPET_TOTAL_LENGTH = 80;
            const searchString = document.getElementById("searchbox").value;
            
            // 1. Read File Content (Async I/O)
            const fileContent = await fileObject.handle.getFile().then(f => f.text());
            
            // 2. Perform Rich Search (Synchronous Computation)
            const richResults = findRichMatches(
                fileContent, 
                searchString, 
                MAX_SNIPPETS, 
                SNIPPET_TOTAL_LENGTH
            );
            
            return richResults;

        } catch (error) {
            console.error("Error reading file or running rich search:", error);
            // Return a failed/empty result object on error
            return {
                hasMatch: false,
                matchCount: 0,
                snippets: []
            };
        }        
    });

    // 2. Wait for all files to be read concurrently.
    const allFileContents = await Promise.all(readPromises);

    console.log(allFileContents[0]);
    

}


// javascript
/**
 * Performs a detailed synchronous search on file content to find matches,
 * count them, and extract snippets. The search is now case-insensitive.
 *
 * @param {string} content - The full text content of the file.
 * @param {string} searchString - The string to search for.
 * @param {number} maxSnippets - The maximum number of detailed snippets to record (e.g., 5).
 * @param {number} snippetLength - The total length of the snippet string (e.g., 40 characters total).
 * @returns {object} A detailed result object.
 */
function findRichMatches(content, searchString, maxSnippets, snippetLength) {
    const results = {
        hasMatch: false,
        matchCount: 0,
        snippets: []
    };

    if (!searchString || searchString.length === 0 || !content) {
        return results;
    }

    // 1. Transform the search string to a consistent case for comparison
    const searchStringLower = searchString.toLowerCase();
    const searchLength = searchStringLower.length;
    
    // 2. Create a lowercase version of the content ONLY for searching
    const contentLower = content.toLowerCase();

    // Calculate the length for text before AND after the match
    const contextLength = Math.floor((snippetLength - searchLength) / 2);

    let currentPosition = -1; // Index within the contentLower string
    let matchIndex = 0;

    // Use a while loop to iteratively find all matches on the lowercase content
    while ((currentPosition = contentLower.indexOf(searchStringLower, currentPosition + 1)) !== -1) {
        
        results.matchCount++;

        // Only record the detailed snippet if we are below the max limit
        if (matchIndex < maxSnippets) {
            
            // 1. Calculate the start and end indices for the snippet context
            //    **currentPosition is relative to the ORIGINAL content length**
            let snippetStart = currentPosition - contextLength;
            let snippetEnd = currentPosition + searchLength + contextLength;

            // 2. Adjust bounds to prevent going outside the content string limits
            if (snippetStart < 0) {
                snippetStart = 0;
            }
            // Use the length of the ORIGINAL content for bounding the end
            if (snippetEnd > content.length) {
                snippetEnd = content.length;
            }
            
            // 3. Extract the snippet string from the ORIGINAL, case-sensitive content
            const snippetText = content.substring(snippetStart, snippetEnd);

            results.snippets.push({
                position: currentPosition,
                snippet: snippetText
            });

            matchIndex++;
        }
    }

    results.hasMatch = results.matchCount > 0;
    return results;
}