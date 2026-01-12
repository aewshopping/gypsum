// **REMOVE LATER** ???

/**
 * Helper function to check if a file's tags match the selected tags.
 * @param {object} file - The file object (which has a .tags array).
 * @param {Set<string>} selectedTags - The set of tags currently selected by the user.
 * @returns {number} The count of matching tags.
 */
export function checkTagMatch(file, selectedTags) {
    if (selectedTags.size === 0) return 0;
    
    let matchCount = 0;
    for (const tag of file.tags) {
        if (selectedTags.has(tag)) {
            matchCount++;
        }
    }
    return matchCount;
}