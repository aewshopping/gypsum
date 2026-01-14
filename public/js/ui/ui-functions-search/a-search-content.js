import { appState } from "../../services/store.js";

/**
 * Performs a parallel search across all file handles in appState.
 */
export async function searchContent(filterId, searchValue, property, type, operator) {

    const MAX_SNIPPETS = 5;
    const SNIPPET_TOTAL_LENGTH = 80;
    const allFiles = appState.myFiles;
    const keyedResults = new Map();

    try {
        // 1. Create the array of promises
        const processingPromises = allFiles.map(async (fileObject) => {
            try {
                const file = await fileObject.handle.getFile();
                const text = await file.text();

                const matches = performSearch(text, searchValue, MAX_SNIPPETS, SNIPPET_TOTAL_LENGTH);

                // create results map
                keyedResults.set(fileObject.filename, {
                    matches: matches,
                    count: matches.length
                });
            } catch (fileErr) {
                console.error(`Failed to process file: ${fileObject.filename}`, fileErr);
                // Assign error info to the map so the UI can show it
                keyedResults.set(fileObject.filename, { matches: [], count: 0, error: fileErr.message });
            }
        });

        // 2. Wait for ALL parallel operations to complete
        await Promise.all(processingPromises);

        // 3. Batch Update
        // TO DO need to change other map values to also be keys
        appState.search.results.set(filterId, keyedResults);

        console.log("Search complete. Results updated in appState.");

    } catch (error) {
        console.error("Critical error during batch search:", error);
    }
}

/**
 * Helper function to find matches and create snippets
 */
// TODO - update DUMMY FUNCTION
function performSearch(text, term, max, length) {
    if (!term) return [];

    const results = [];
    const regex = new RegExp(term, 'gi');
    let match;

    while ((match = regex.exec(text)) !== null && results.length < max) {
        const start = Math.max(0, match.index - length / 2);
        const snippet = text.substring(start, start + length).replace(/\n/g, ' ');
        results.push({
            index: match.index,
            snippet: `...${snippet}...`
        });
    }
    return results;
}