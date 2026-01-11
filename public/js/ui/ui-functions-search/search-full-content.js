// import { appState } from "../../services/store.js"; // No longer needed inside the function

/**
 * Executes rich content search concurrently on a subset of files.
 *
 * @param {Array<object>} filesToSearch - The subset of file objects to perform the search on.
 * @param {string} searchString - The simple string to search for (derived from tokens in the caller).
 * @returns {Promise<Array<{file: object, richResults: object}>>} A promise that resolves with an array of
 * the original file object and its rich search results.
 */
export async function searchAllFileContent(filesToSearch, searchString) {
    if (!filesToSearch || filesToSearch.length === 0) {
        return [];
    }
    
    // Define parameters once
    const MAX_SNIPPETS = 5; 
    const SNIPPET_TOTAL_LENGTH = 80;

    // 1. Create an array of Promises for concurrent file reading.
    const searchPromises = filesToSearch.map(async fileObject => {
        try {
            // Check for handle existence
            if (!fileObject.handle) {
                 throw new Error("File object is missing a handle property.");
            }
            
            // 1. Read File Content (Async I/O)
            const fileContent = await fileObject.handle.getFile().then(f => f.text());
            
            // 2. Perform Rich Search (Synchronous Computation)
            const richResults = findRichMatches(
                fileContent, 
                searchString, 
                MAX_SNIPPETS, 
                SNIPPET_TOTAL_LENGTH
            );
            
            // CRITICAL FIX: Return the file object along with the rich results
            return { file: fileObject, richResults };

        } catch (error) {
            console.error(`Error reading file ${fileObject.name || fileObject.handle.name} or running rich search:`, error);
            
            // CRITICAL FIX: Always return a consistent structure on failure
            return {
                file: fileObject,
                richResults: {
                    hasMatch: false,
                    matchCount: 0,
                    snippets: []
                }
            };
        }
    });

    // 2. Wait for all Promises to be read concurrently.
    // This resolves to an ARRAY of the objects returned in the map callback.
    const allSearchResults = await Promise.all(searchPromises);

    return allSearchResults;
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