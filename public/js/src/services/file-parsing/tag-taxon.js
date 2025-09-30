// more or less vibe coded with Gemini 30 Sept 2025
/**
 * Creates an array structure grouped by unique parent tags, using a pre-counted
 * array for the child tag counts.
 *
 * @param {object} data The object containing the 'fileobject' array.
 * @param {Array<Array<string | number>>} childtagsandcounts Array of [childtag, count].
 * @returns {Array<[string, Array<[string, number]>]>} An array in the format:
 * [parenttag, [[childtag1, count], [childtag2, count], ...]]
 */
export function createParentChildTagStructure(data, childtagsandcounts) {
    // 1. Convert the count array to a Map for O(1) count lookups.
    const childCountMap = new Map(childtagsandcounts);

    // Map to hold parentTag -> Set<childTag> to track unique relationships.
    const parentToChildrenMap = new Map();

    // 2. Iterate through the fileobject to establish unique parent-child relationships.

    for (const file of data) {
        // ASSUMPTION: file.tags_parent and file.tags are related by index (positional mapping).
        const parentTags = file.tags_parent || [];
        const childTags = file.tags || [];

        // Determine the length to iterate over, limited by the shortest array
        const relationshipCount = Math.min(parentTags.length, childTags.length);

        // Iterate by index to correctly associate a parent tag with its specific child tag
        for (let i = 0; i < relationshipCount; i++) {
            const parentTag = parentTags[i];
            const childTag = childTags[i];

            // 1. Ensure the parent tag has an associated Set initialized
            if (!parentToChildrenMap.has(parentTag)) {
                parentToChildrenMap.set(parentTag, new Set());
            }

            // 2. Get the Set for the current parentTag
            const childTagSet = parentToChildrenMap.get(parentTag);

            // 3. Add ONLY the corresponding child tag to the parent's Set.
            // A Set automatically handles uniqueness of child tags per parent.
            childTagSet.add(childTag);
        }
    }


    // 3. Construct the final array by merging relationships with the pre-calculated counts.
    const result = [];

    for (const [parentTag, childTagSet] of parentToChildrenMap.entries()) {
        const childTagsAndCounts = [];

        for (const childTag of childTagSet) {
            // Retrieve the count from the pre-calculated map. Use 0 if the tag isn't in the child map (shouldn't happen if the child map is derived from all tags).
            const count = childCountMap.get(childTag) || 0; 
            
            // Format as [childtag, count]
            childTagsAndCounts.push([childTag, count]);
        }

        // Format as [parenttag, [child tags and counts array]]
        result.push([parentTag, childTagsAndCounts]);
    }

    return result;
}