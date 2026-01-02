// Function to get unique tags with their counts, sorted alphabetically
// Needs to be passed an object, that contains an array of objects, each with a tags key (that is an array of tags)
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

function compareTagsAlphabetically(a, b) {
  // a[0] and b[0] are the tag strings.
  return a[0].localeCompare(b[0]);
}