import { buildMatchResultObject } from "./a-search-helpers.js";


/**
 * Searches a file's content for a search value and returns a standardized result object with snippets.
 * @function findContentMatches
 * @param {string} content - The file content to search.
 * @param {string} searchValue - The value to search for.
 * @param {string} property - The property name (typically "content").
 * @param {string} type - The property type.
 * @param {string} operator - The search operator.
 * @param {number} MAX_SNIPPETS - The maximum number of snippets to extract.
 * @param {number} SNIPPET_TOTAL_LENGTH - The target total length for each snippet.
 * @returns {object|null} A result object containing match counts and snippets, or null if no match is found.
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
 * Extracts a snippet of text around a match, attempting to snap to whole words.
 * @function getCleanSnippet
 * @param {string} content - The full text content.
 * @param {number} index - The starting position of the match.
 * @param {number} searchLen - The length of the search term.
 * @param {number} [targetLen=80] - The desired total length of the snippet.
 * @returns {string} The extracted and cleaned snippet.
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