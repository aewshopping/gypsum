/**
 * Identifies and extracts the lines of YAML front-matter content
 * found between the first two '---' separators.
 *
 * IMPORTANT: It checks if the starting '---' is within the first 5 lines (indices 0-4)
 * and if the first separator is on the very first line (index 0).
 *
 * @param {string} yamlString - The raw content string (e.g., markdown with front-matter).
 * @returns {string[] | null} An array of strings containing the YAML lines, or null if no valid front-matter is found.
 */
export const getFrontMatterLines = (yamlString) => {
    const lines = yamlString.split("\n");
    const separator = "---";
    const MAX_SEARCH_LINES = 5;

    // Find the first '---'
    const firstSeparatorIndex = lines.findIndex(
        (line) => line.trim() === separator
    );

    // 1. Check if the first '---' was found within the first N lines (0-4)
    if (firstSeparatorIndex === -1 || firstSeparatorIndex >= MAX_SEARCH_LINES) {
        return null;
    }

    // Find the second '---', starting the search *after* the first one
    const secondSeparatorIndex = lines.findIndex(
        (line, index) => index > firstSeparatorIndex && line.trim() === separator
    );

    // 2. The first separator must be on the first line (index 0) AND the second one must exist
    if (firstSeparatorIndex !== 0 || secondSeparatorIndex === -1) {
        return null;
    }

    // Slice the lines between the two separators
    return lines.slice(firstSeparatorIndex + 1, secondSeparatorIndex);
};