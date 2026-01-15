import { appState } from "../../services/store.js";

//TODO see if we can use these helper function across property search
//TODO split into separate files
/**
 * Helper: Standardizes the Map retrieval
 */
function getFilterMap(filterId) {
    let map = appState.search.results.get(filterId);
    return (map instanceof Map) ? map : new Map();
}

/**
 * Helper: Standardizes the data structure added to the results map.
 * Now accepts a 'details' object to handle matches, snippets, etc.
 */
function recordMatch(map, filename, details) {
    if (details && details.count > 0) {
        map.set(filename, details);
    }
}

/**
 * Helper: Finalizes the state update
 */
function updateSearchState(filterId, resultsMap) {
    if (resultsMap.size > 0) {
        appState.search.results.set(filterId, resultsMap);
        console.log(`Search complete. Results for ${filterId} updated.`);
    }
}

export async function searchContent(filterId, searchValue, property, type, operator) {
    const MAX_SNIPPETS = 5;
    const SNIPPET_TOTAL_LENGTH = 80;
    const keyedResults = getFilterMap(filterId);

    try {
        const processingPromises = appState.myFiles.map(async (fileObject) => {
            try {
                const file = await fileObject.handle.getFile();
                const text = await file.text();

                // Logic to find matches
                const result = findContentMatches(
                    text, 
                    searchValue, 
                    MAX_SNIPPETS, 
                    SNIPPET_TOTAL_LENGTH
                );

                // Use the standardized record helper
                recordMatch(keyedResults, fileObject.filename, result);

            } catch (fileErr) {
                console.error(`Failed to process file: ${fileObject.filename}`, fileErr);
            }
        });

        await Promise.all(processingPromises);
        updateSearchState(filterId, keyedResults);

    } catch (error) {
        console.error("Critical error during batch search:", error);
    }
}

/**
 * Processes content. Returns an object with count and matches, or null.
 * I removed the internal Map creation to keep it focused strictly on finding data.
 */
export function findContentMatches(content, searchValue, MAX_SNIPPETS, SNIPPET_TOTAL_LENGTH) {
    const searchLower = searchValue.toLowerCase();
    const contentLower = content.toLowerCase();
    let position = contentLower.indexOf(searchLower);

    if (position === -1) return null;

    const matches = [];
    let totalCount = 0;

    while (position !== -1) {
        totalCount++;
        if (matches.length < MAX_SNIPPETS) {
            matches.push({
                position: position,
                snippet: getCleanSnippet(content, position, searchValue.length, SNIPPET_TOTAL_LENGTH)
            });
        }
        position = contentLower.indexOf(searchLower, position + 1);
    }

    return {
        count: totalCount,
        matches: matches
    };
}

/**
 * Helper to extract context and snap to whole words.
 */
function getCleanSnippet(content, index, searchLen, targetLen = 80) {
    const contextLen = Math.floor((targetLen - searchLen) / 2);
    let start = Math.max(0, index - contextLen);
    let end = Math.min(content.length, index + searchLen + contextLen);

    if (start > 0) {
        const nextSpace = content.indexOf(' ', start);
        if (nextSpace !== -1 && nextSpace < index) {
            start = nextSpace + 1;
        }
    }

    if (end < content.length) {
        const lastSpace = content.lastIndexOf(' ', end);
        if (lastSpace !== -1 && lastSpace > (index + searchLen)) {
            end = lastSpace;
        }
    }

    return content.substring(start, end).trim();
}