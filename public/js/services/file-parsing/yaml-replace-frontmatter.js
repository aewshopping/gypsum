import { findFrontMatterIndices } from "./yaml-find.js";

/**
 * Replaces the YAML front-matter block, including both '---' separators, with the given
 * replacement text, preserving its original position in the document.
 *
 * @param {string} fullString - The raw content string.
 * @param {string} replacement - The text to substitute in place of the front-matter block.
 * @returns {string} The text with the front-matter block replaced, or the original string if no valid block is found.
 */
export const replaceFrontMatter = (fullString, replacement) => {
    const indices = findFrontMatterIndices(fullString);

    if (!indices) {
        return fullString;
    }

    const lines = fullString.split("\n");
    lines.splice(indices.start, indices.end - indices.start + 1, replacement);

    return lines.join("\n");
};
