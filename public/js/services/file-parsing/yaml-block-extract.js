import { findFrontMatterIndices } from "./yaml-find.js";

// javascript
/**
 * Extracts the lines of YAML front-matter content found between the two '---' separators.
 * This is designed to be used by the YAML parser.
 *
 * @function getFrontMatterLines
 * @param {string} yamlString - The raw content string.
 * @returns {string[] | null} An array of strings containing the YAML lines, or null if no valid front-matter is found.
 */
export const getFrontMatterLines = (yamlString) => {
    const indices = findFrontMatterIndices(yamlString);

    if (!indices) {
        return null;
    }

    const lines = yamlString.split("\n");
    
    // Slice only the content between the separators (exclusive of the '---' lines)
    return lines.slice(indices.start + 1, indices.end);
};