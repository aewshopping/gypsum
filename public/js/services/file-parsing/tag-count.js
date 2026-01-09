/**
 * @file This file contains functions for counting and sorting tags from a collection of file objects.
 */

/**
 * Calculates the frequency of each tag across all files and returns a sorted list of unique tags with their counts.
 *
 * @param {Array<Object>} dataObject An array of file objects, where each object is expected to have a `tags` property containing an array of tag strings.
 * @returns {Array<[string, number]>} An array of tuples, where each tuple contains a tag and its corresponding count. The array is sorted alphabetically by tag.
 */
export function getUniqueTagsSortedWithCount(dataObject) {
  const tagCounts = new Map();

  // 1. Count the tags
  for (const file of dataObject) {
    for (const tag of file.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  // 2. Convert Map entries to an array and sort
  const sortedEntries = [...tagCounts.entries()].sort(compareTagsAlphabetically);
  return sortedEntries;

}

/**
 * Comparator function for sorting tag entries alphabetically by tag name.
 *
 * @param {[string, number]} a The first tag entry to compare.
 * @param {[string, number]} b The second tag entry to compare.
 * @returns {number} A negative, zero, or positive value, indicating the alphabetical order of the tags.
 */
function compareTagsAlphabetically(a, b) {
  // a[0] and b[0] are the tag strings.
  return a[0].localeCompare(b[0]);
}