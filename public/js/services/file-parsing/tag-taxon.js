/**
 * @file Builds the global parent→child tag Map from all loaded file objects.
 */

/**
 * Builds a Map of parent tags to their child tags with global file counts,
 * using a single pass over all files.
 *
 * The returned Map is ordered: named parents alphabetically, then 'orphan', then 'all'.
 * - Each named parent key maps to a Map<childTag, count> for tags that appear under that parent.
 * - 'orphan' maps to tags that never appear under any named parent across any file.
 * - 'all' maps to every child tag with its total count across all files.
 *
 * @param {Array<object>} files - Array of file objects, each with a `tags` property that is a
 *   Map<childTagName, {count: number, parents: Set<string>}>.
 * @returns {Map<string, Map<string, number>>} The assembled parent map.
 */
export function buildParentMap(files) {

    // Stage 1: Single pass — accumulate per-parent counts and global counts
    const rawParentMap = new Map(); // Map<parentName, Map<childName, count>>
    const allMap = new Map();       // Map<childName, globalCount>

    for (const file of files) {
        for (const [childTag, { parents }] of file.tags) {

            // Global count
            allMap.set(childTag, (allMap.get(childTag) || 0) + 1);

            // Per-parent counts (only for tags with named parents)
            for (const parent of parents) {
                if (!rawParentMap.has(parent)) {
                    rawParentMap.set(parent, new Map());
                }
                const pm = rawParentMap.get(parent);
                pm.set(childTag, (pm.get(childTag) || 0) + 1);
            }
        }
    }

    // Stage 2: Compute orphans via set subtraction
    // familyTags = union of all children appearing under any named parent across all files
    const familyTags = new Set();
    for (const childMap of rawParentMap.values()) {
        for (const childTag of childMap.keys()) {
            familyTags.add(childTag);
        }
    }

    // orphans = tags in 'all' that never appear under any named parent
    const orphanMap = new Map();
    for (const [childTag, count] of allMap) {
        if (!familyTags.has(childTag)) {
            orphanMap.set(childTag, count);
        }
    }

    // Stage 3: Sort and assemble the final Map
    // Maps maintain insertion order, so we sort before inserting.
    const sortedChildMap = (m) => new Map([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])));

    const sortedParentEntries = [...rawParentMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([parent, childMap]) => [parent, sortedChildMap(childMap)]);

    const result = new Map(sortedParentEntries);
    if (orphanMap.size > 0) {
        result.set('orphan', sortedChildMap(orphanMap));
    }
    result.set('all', sortedChildMap(allMap));

    return result;
}
