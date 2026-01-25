import { buildMatchResultObject } from "./a-search-helpers.js";


/**
 * Processes content. Returns an object with count and matches, or null.
 */
export function findContentMatches(content, searchValue, property, type, operator, MAX_SNIPPETS, SNIPPET_TOTAL_LENGTH) {
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

    return buildMatchResultObject(totalCount, property, type, operator, matches, searchValue);
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