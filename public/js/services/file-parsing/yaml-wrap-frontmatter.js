import { findFrontMatterIndices } from "./yaml-find.js";

// javascript
/**
 * Locates the YAML front-matter block AND its '---' separators, and wraps the entire
 * block with a starting and ending marker, ensuring no extra line breaks are introduced.
 *
 * @param {string} fullString - The raw content string.
 * @param {string} startMarker - The marker to place before the block (e.g., "<pre>").
 * @param {string} endMarker - The marker to place after the block (e.g., "</pre>").
 * @returns {string} The modified string with the markers added, or the original string if no valid YAML block is found.
 */
export const wrapFrontMatter = (fullString, startMarker, endMarker) => {
    const indices = findFrontMatterIndices(fullString);

    if (!indices) {
        return fullString;
    }

    // Split the string into lines
    const lines = fullString.split("\n");
    let { start, end } = indices; // Use 'let' because 'end' will change

    // --- 1. Combine Marker and First Separator ---
    // Combine the start marker with the original '---' line content, ensuring no newline is placed between them.
    const newStartLine = startMarker + lines[start];
    
    // Replace the original '---' line with the combined string.
    // splice(start, 1, newStartLine) means:
    // - Start at 'start' index, Delete 1 element (the original '---' line), Insert the new combined line
    lines.splice(start, 1, newStartLine);

    // After this operation, the line count is unchanged, but the content at 'start' is different.
    // The 'end' index remains valid for the second separator.

    // --- 2. Combine Marker and Second Separator ---
    // Combine the end separator '---' line with the end marker.
    // The 'end' index must be updated because the start line was replaced/merged (not inserted).
    // The indices are still valid for 'end'.

    // Combine the end marker with the original '---' line content.
    const newEndLine = lines[end] + endMarker;

    // Replace the original '---' line with the combined string.
    // splice(end, 1, newEndLine) means:
    // - Start at 'end' index, Delete 1 element (the original '---' line), Insert the new combined line
    lines.splice(end, 1, newEndLine);


    return lines.join("\n");
};