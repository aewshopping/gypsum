

// Define the key strings once for consistency
const ORPHAN_TAG_KEY = "orphan";
const ALL_TAG_KEY = "all"; // Implemented the constant for the "all" parent tag

/**
 * Stage 1: Iterates through the data to establish unique parent-child relationships
 * and track non-orphan children.
 *
 * @function mapRelationshipsAndTrackExclusivity
 * @param {object} data The object containing the 'fileobject' array.
 * @returns {{parentToChildrenMap: Map<string, Set<string>>, nonOrphanChildTags: Set<string>}}
 */
function mapRelationshipsAndTrackExclusivity(data) {
    // NOTE: This function's logic relies entirely on the positional mapping 
    // assumption between 'file.tags_parent' and 'file.tags'.

    const parentToChildrenMap = new Map();
    const nonOrphanChildTags = new Set(); 

    for (const file of data) {
        const parentTags = file.tags_parent || [];
        const childTags = file.tags || [];
        const relationshipCount = Math.min(parentTags.length, childTags.length);

        for (let i = 0; i < relationshipCount; i++) {
            const parentTag = parentTags[i];
            const childTag = childTags[i];

            // A. Track child tags that are NOT exclusive to 'orphan'
            if (parentTag !== ORPHAN_TAG_KEY) {
                nonOrphanChildTags.add(childTag);
            }

            // B. Build the main parentToChildrenMap
            if (!parentToChildrenMap.has(parentTag)) {
                parentToChildrenMap.set(parentTag, new Set());
            }
            parentToChildrenMap.get(parentTag).add(childTag);
        }
    }
    return { parentToChildrenMap, nonOrphanChildTags };
}

/**
 * Stage 2: Filters the 'orphan' parent tag's children to ensure only tags 
 * exclusive to the 'orphan' category remain.
 *
 * @function filterExclusiveOrphanTags
 * @param {Map<string, Set<string>>} parentToChildrenMap Map of parentTag -> Set<childTag>.
 * @param {Set<string>} nonOrphanChildTags Set of all child tags with a non-orphan parent.
 * @returns {void}
 */
function filterExclusiveOrphanTags(parentToChildrenMap, nonOrphanChildTags) {
    if (parentToChildrenMap.has(ORPHAN_TAG_KEY)) {
        const orphanChildTagSet = parentToChildrenMap.get(ORPHAN_TAG_KEY);
        const exclusiveOrphanChildTags = new Set();
        
        for (const childTag of orphanChildTagSet) {
            // Retain only child tags NOT associated with any non-orphan parent.
            if (!nonOrphanChildTags.has(childTag)) {
                exclusiveOrphanChildTags.add(childTag);
            }
        }
        
        // Update the map with the new, exclusive set.
        parentToChildrenMap.set(ORPHAN_TAG_KEY, exclusiveOrphanChildTags);
    }
}

/**
 * Stage 3: Constructs the final result array by merging relationships with counts
 * and applying final sorting and placement rules.
 *
 * @function structureAndSortResult
 * @param {Map<string, Set<string>>} parentToChildrenMap Map of parentTag -> Set<childTag>.
 * @param {Map<string, number>} childCountMap Map of childTag -> count.
 * @param {Array<Array<string | number>>} allChildTagsAndCounts Original array for the 'all' category.
 * @returns {Array<[string, Array<[string, number]>]>} The final structured array.
 */
function structureAndSortResult(parentToChildrenMap, childCountMap, allChildTagsAndCounts) {
    const result = [];

    // Aggregate counts for all parent categories
    for (const [parentTag, childTagSet] of parentToChildrenMap.entries()) {
        const childTagsAndCounts = [];

        // Convert Set to array to allow sorting
        const childTagsArray = Array.from(childTagSet);

        // Sort the child tags alphabetically (as requested by the user)
        childTagsArray.sort((a, b) => a.localeCompare(b));
        
        for (const childTag of childTagsArray) {
            const count = childCountMap.get(childTag) || 0; 
            childTagsAndCounts.push([childTag, count]);
        }

        result.push([parentTag, childTagsAndCounts]);
    }
    
    // Initial sort alphabetically by parent tag
    result.sort((a, b) => a[0].localeCompare(b[0]));

    // Move the "orphan" parent array to the end
    const orphanIndex = result.findIndex(item => item[0] === ORPHAN_TAG_KEY);
    if (orphanIndex !== -1) {
        const orphanEntry = result.splice(orphanIndex, 1)[0];
        result.push(orphanEntry);
    }

    // Add the "all" category at the very end using the new constant
    result.push([ALL_TAG_KEY, allChildTagsAndCounts]);

    return result;
}


/**
 * Orchestrator: Creates an array structure grouped by unique parent tags, using a pre-counted
 * array for the child tag counts.
 *
 * @function createParentChildTagStructure
 * @param {object} data The object containing the 'fileobject' array.
 * @param {Array<Array<string | number>>} childtagsandcounts Array of [childtag, count].
 * @returns {Array<[string, Array<[string, number]>]>} An array in the format:
 * [parenttag, [[childtag1, count], [childtag2, count], ...]]
 */
export function createParentChildTagStructure(data, childtagsandcounts) {
    // 1. Prepare data structures for O(1) lookups
    const childCountMap = new Map(childtagsandcounts);

    // 2. Map relationships and identify non-exclusive orphan candidates
    const { parentToChildrenMap, nonOrphanChildTags } = mapRelationshipsAndTrackExclusivity(data);

    // 3. Filter the 'orphan' set to ensure exclusivity
    filterExclusiveOrphanTags(parentToChildrenMap, nonOrphanChildTags);

    // 4. Aggregate counts, structure the final result, and apply sorting/placement
    return structureAndSortResult(parentToChildrenMap, childCountMap, childtagsandcounts);
}
