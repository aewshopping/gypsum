// javascript
/**
 * Locates the line indices of the YAML front-matter block, including the '---' separators.
 * This version allows the starting '---' to be on ANY line, as long as the block is properly closed.
 *
 * @param {string} fullString - The raw content string.
 * @returns {{start: number, end: number} | null} An object with the 0-based start and end line indices, or null if not found.
 */
export const findFrontMatterIndices = (fullString) => {
    const lines = fullString.split("\n");
    const separator = "---";
    const MAX_SEARCH_LINES = 5;

    // 1. Find the first '---'
    const start = lines.findIndex(
        (line) => line.trim() === separator
    );

    // Check constraints: found, and within the first N lines (0-4)
    if (start === -1 || start >= MAX_SEARCH_LINES) {
        return null;
    }

    // 2. Find the second '---', starting the search *after* the first one
    const end = lines.findIndex(
        (line, index) => index > start && line.trim() === separator
    );

    // Check constraints: only requires the second separator to exist
    if (end === -1) {
        return null;
    }

    // --- The key change is here: Removed the check 'start !== 0' ---
    // The previous check was: if (start !== 0 || end === -1) { return null; }

    return { start, end };
};