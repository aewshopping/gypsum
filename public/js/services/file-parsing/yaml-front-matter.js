/**
 * Extracts the YAML front matter block from a file's content string.
 *
 * It looks for a block of text at the beginning of the file enclosed by '---' separators.
 * If a valid block is found, it returns the block itself and the rest of the content.
 * Otherwise, it returns the original content as the main content.
 *
 * @param {string} fileContent The entire string content of the file.
 * @returns {{yamlBlock: string, remainingContent: string}} An object.
 * - `yamlBlock` contains the identified YAML front matter (including separators).
 * - `remainingContent` contains the rest of the file content.
 */
export const extractYamlFrontMatter = (fileContent) => {
  const lines = fileContent.split('\n');
  const separator = '---';

  // The YAML block must start at the first line.
  if (lines[0].trim() !== separator) {
      return { yamlBlock: '', remainingContent: fileContent };
  }

  // Find the closing separator, starting the search from the second line.
  const secondSeparatorIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === separator
  );

  // If no closing separator is found, it's not a valid block.
  if (secondSeparatorIndex === -1) {
    return { yamlBlock: '', remainingContent: fileContent };
  }

  const yamlLines = lines.slice(0, secondSeparatorIndex + 1);
  const remainingLines = lines.slice(secondSeparatorIndex + 1);

  return {
    yamlBlock: yamlLines.join('\n'),
    remainingContent: remainingLines.join('\n'),
  };
};
