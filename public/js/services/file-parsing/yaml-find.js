const SEPARATOR = "---";
const MAX_SEARCH_LINES = 5;

/**
 * Whether a line may sit above the opening separator without disqualifying it.
 *
 * What this is for: in markdown a '---' underlines a paragraph, so a note written with underlined
 * headings had the prose after its first heading read as front matter and deleted from the
 * rendered view. Refusing prose above the separator is what stops that.
 *
 * A line of hashes is not prose. A heading is the case the markdown argues for — '---' cannot
 * underline one, so '# my title' may sit above front matter while 'My Title' may not. A tag line
 * is the case it argues against, since '#admin' is a paragraph and a '---' under it is a setext
 * underline by the letter of the spec; it is allowed anyway, because a tag above one's own front
 * matter is a shape people write and an underlined heading spelt '#admin' is not. One test covers
 * both, which is why this asks for a leading hash rather than for a well-formed heading.
 *
 * The allowance is paid for below: when anything sits above the separator the block must also
 * hold a key or a list item, so the shapes that would cost a note its body are still refused.
 *
 * @param {string} trimmed - A line with its surrounding whitespace removed.
 * @returns {boolean} True when the line is blank, or is a heading or a line of tags.
 */
const canPrecedeBlock = (trimmed) => trimmed === "" || trimmed.startsWith("#");

/**
 * Whether a line reads as front matter content rather than prose. Recognising a block and
 * parsing it cleanly are separate questions: one readable line is enough to claim the block,
 * and the rest are left to the parser to skip and report.
 *
 * Only consulted when something precedes the opening separator, where a '---' could be a
 * thematic break instead. A separator on the first line has nothing above it to be a break
 * between, so a block opening there is taken at its word however badly it is written.
 *
 * @param {string} trimmed - A line with its surrounding whitespace removed.
 * @returns {boolean} True when the line looks like a key or a list item.
 */
const readsAsFrontMatter = (trimmed) =>
    trimmed.startsWith("- ") || trimmed === "-" || /^[^:#\s][^:]*:(\s|$)/.test(trimmed);

/**
 * Locates the line indices of the YAML front-matter block, including the '---' separators.
 *
 * Nothing but blank lines, headings and tag lines may sit above the opening separator, which
 * rejects a setext underline. When something does sit above it, the block must also contain at
 * least one line that reads as front matter, which rejects prose between two horizontal rules. A
 * separator on the first line is unambiguous and needs only the first test.
 *
 * @param {string} fullString - The raw content string.
 * @returns {{start: number, end: number} | null} An object with the 0-based start and end line indices, or null if not found.
 */
export const findFrontMatterIndices = (fullString) => {
    const lines = fullString.split("\n");

    let start = -1;
    const searchLimit = Math.min(MAX_SEARCH_LINES, lines.length);
    for (let i = 0; i < searchLimit; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === SEPARATOR) {
            start = i;
            break;
        }
        if (!canPrecedeBlock(trimmed)) return null;
    }
    if (start === -1) return null;

    let end = -1;
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].trim() === SEPARATOR) {
            end = i;
            break;
        }
    }
    if (end === -1) return null;

    if (start === 0) return { start, end };

    for (let i = start + 1; i < end; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === "" || trimmed.startsWith("#")) continue;
        if (readsAsFrontMatter(trimmed)) return { start, end };
    }
    return null;
};
