const SEPARATOR = "---";
const MAX_SEARCH_LINES = 5;

/**
 * Whether a line reads as front matter content rather than prose. Recognising a block and
 * parsing it cleanly are separate questions: one readable line is enough to claim the block,
 * and the rest are left to the parser to skip and report.
 *
 * Only consulted when the opening separator is not on the first line, where a '---' could be a
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
 * The opening separator may be on any of the first five lines, whatever sits above it — a title,
 * a tag line, anything. What is above is never inspected. When the block does not open on the
 * first line it must hold at least one line that reads as front matter, which stops two
 * horizontal rules around a stretch of prose being taken for a block and hidden from the note.
 *
 * @param {string} fullString - The raw content string.
 * @returns {{start: number, end: number} | null} An object with the 0-based start and end line indices, or null if not found.
 */
export const findFrontMatterIndices = (fullString) => {
    const lines = fullString.split("\n");

    const searchLimit = Math.min(MAX_SEARCH_LINES, lines.length);
    let start = -1;
    for (let i = 0; i < searchLimit; i++) {
        if (lines[i].trim() === SEPARATOR) {
            start = i;
            break;
        }
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
        if (readsAsFrontMatter(lines[i].trim())) return { start, end };
    }
    return null;
};
