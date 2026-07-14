import { findFrontMatterIndices } from "./yaml-find.js";

/**
 * Removes the YAML front-matter block, including both '---' separators, from the given text.
 *
 * @param {string} fullString - The raw content string.
 * @returns {string} The text with the front-matter block removed, or the original string if no valid block is found.
 */
export const stripFrontMatter = (fullString) => {
    const indices = findFrontMatterIndices(fullString);

    if (!indices) {
        return fullString;
    }

    const lines = fullString.split("\n");
    lines.splice(indices.start, indices.end - indices.start + 1);

    return lines.join("\n");
};
