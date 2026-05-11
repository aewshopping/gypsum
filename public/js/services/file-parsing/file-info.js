import { regex_title, regex_tag } from '../../constants.js';
import { parseYaml } from './yaml-parse.js';
import { findFrontMatterIndices } from './yaml-find.js';
import { updateMyFilesProperties } from '../file-props.js';

/**
 * @file Extracts metadata from file content, including title, tags, and YAML front matter.
 */

/**
 * Processes a file handle to extract its content and metadata.
 * It reads the file, parses its content for tags and YAML front matter,
 * and constructs a file object with all the relevant information.
 * @param {FileSystemFileHandle} handle The file handle to process.
 * @param {number} loadOrder The order in which the file was loaded.
 * @returns {Promise<object>} A promise that resolves to an object containing the file's metadata.
 */
export async function getFileDataAndMetadata(handle, loadOrder) {

    const file = await handle.getFile();
    const content = await file.text();
    const frontMatterIndices = findFrontMatterIndices(content);
    const tagData = parseFileContent(content, frontMatterIndices);
    const yamlData = parseYaml(content);
    updateMyFilesProperties(yamlData, 2);

    // Merge YAML tags into the TagMap as orphan tags, then remove from yamlData
    // to prevent the spread from overwriting the TagMap with a plain array.
    if (yamlData.tags) {
        const yamlTags = Array.isArray(yamlData.tags) ? yamlData.tags : [yamlData.tags];
        for (const yamlTag of yamlTags) {
            const lowerTag = String(yamlTag).toLowerCase().trim();
            if (lowerTag && !tagData.tagMap.has(lowerTag)) {
                tagData.tagMap.set(lowerTag, { count: 1, parents: new Set() });
            }
        }
        delete yamlData.tags;
    }

    return {
        handle: handle,
        filename: file.name,
        sizeInBytes: file.size,
        title: tagData.titleFirst,
        contentPeek: tagData.contentPeek,
        tags: tagData.tagMap,
        color: tagData.colorFirst,
        lastModified: new Date(file.lastModified),
        ...(yamlData)
    };

}

const regex_pattern = `${regex_title.source}|${regex_tag.source}`;
const regex_all = new RegExp(regex_pattern, "gm");
const regex_tag_match = new RegExp(regex_tag.source, "gm");

const PEEK_TARGET_CHARS = 100;
const PEEK_MAX_CHARS = 130;

/**
 * MAIN FUNCTION: Parses file content to find title, unique tags (as a TagMap), and first color tag.
 *
 * @param {string} fileContent - The text content of the file.
 * @param {{start: number, end: number} | null} frontMatterIndices - Pre-computed YAML block line indices, or null if absent.
 * @returns {{titleFirst: string, tagMap: Map<string, {count: number, parents: Set<string>}>, colorFirst: string | null}} - Extracted data.
 */
function parseFileContent(fileContent, frontMatterIndices) {
    let tagState = {
        tagMap: new Map(),  // Map<childTagName, {count: number, parents: Set<string>}>
        colorFirst: null,
    };

    // 1. Extract Matches and get Initial Title
    const { titleFirst: initialTitle } = extractMatches(fileContent, regex_all, regex_tag_match, tagState);

    // 2. Finalize Title and Content Preview
    const titleFirst = getInitialTitle(fileContent, initialTitle, regex_tag_match, tagState, frontMatterIndices);
    const contentPeek = getContentPeek(fileContent, initialTitle, frontMatterIndices);

    // 3. Return results
    return {
        titleFirst: titleFirst.trim(),
        contentPeek,
        tagMap: tagState.tagMap,
        colorFirst: tagState.colorFirst,
    };
}

/**
 * Processes a single potential tag, adding it to the TagMap.
 * If the child tag already exists, the parent is added to its parents Set (multi-parent support).
 * If the child tag is new, a fresh entry is created.
 *
 * @param {{childValue: string, parentValue: string | undefined}} tagInfo - The tag parts.
 * @param {{tagMap: Map<string, {count: number, parents: Set<string>}>, colorFirst: string | null}} tagState - State object for accumulating tag data.
 */
function processTag({ childValue, parentValue }, tagState) {
    if (!childValue) return;

    const lowerChild = childValue.toLowerCase();
    const lowerParent = (parentValue || "orphan").toLowerCase();

    const existing = tagState.tagMap.get(lowerChild);
    if (existing) {
        // Tag already seen in this file — add parent to its Set if not orphan
        if (lowerParent !== "orphan") {
            existing.parents.add(lowerParent);
        }
    } else {
        // New tag — create entry
        const parents = new Set();
        if (lowerParent !== "orphan") {
            parents.add(lowerParent);
        }
        tagState.tagMap.set(lowerChild, { count: 1, parents });

        // Handle color tag extraction
        if ((lowerParent === "color" || lowerParent === "colour") && tagState.colorFirst === null) {
            tagState.colorFirst = childValue;
        }
    }
}

/**
 * Extracts titles and tags from the file content using matchAll.
 * Updates the tagState and finds the first title.
 *
 * @param {string} fileContent - The text to parse.
 * @param {RegExp} regex_all - Combined regex for title and tags.
 * @param {RegExp} regex_tag_match - Regex specifically for tags (used for title inspection).
 * @param {{tagMap: Map<string, {count: number, parents: Set<string>}>, colorFirst: string | null}} tagState - State object to pass to processTag.
 * @returns {{titleFirst: string | null}} - The first encountered title.
 */
function extractMatches(fileContent, regex_all, regex_tag_match, tagState) {
    let titleFirst = null;
    const matches = fileContent.matchAll(regex_all);

    // regex_all groups: 1 = title, 3 = tag parent, 4 = tag child
    for (const [, titleValue, , parentValue, childValue] of matches) {

        // 1. Process Title
        if (titleFirst === null && titleValue) {
            titleFirst = titleValue;
        }

        // 2. Process Tag
        processTag({ childValue, parentValue }, tagState);
    }
    return { titleFirst };
}

/**
 * Returns the index and trimmed text of the first non-empty line at or after startIndex,
 * skipping any lines inside the YAML front-matter block.
 *
 * @param {string[]} lines - File content split into lines.
 * @param {number} startIndex - 0-based index to begin searching from.
 * @param {{start: number, end: number} | null} frontMatterIndices
 * @returns {{ lineIndex: number, lineText: string } | null}
 */
function findFirstContentLine(lines, startIndex, frontMatterIndices) {
    const yamlStart = frontMatterIndices?.start ?? -1;
    const yamlEnd = frontMatterIndices?.end ?? -1;
    for (let i = startIndex; i < lines.length; i++) {
        if (yamlStart !== -1 && i >= yamlStart && i <= yamlEnd) continue;
        if (lines[i].trim() !== '') return { lineIndex: i, lineText: lines[i].trim() };
    }
    return null;
}

/**
 * Determines the final title, falling back to the first non-empty line after the YAML block
 * (if present) or the first line of the file when no markdown H1 is found.
 * Also checks the final title for any lurking tags.
 *
 * @param {string} fileContent - The full text.
 * @param {string | null} initialTitle - The first title found by extractMatches.
 * @param {RegExp} regex_tag_match - Regex specifically for tags.
 * @param {{tagMap: Map<string, {count: number, parents: Set<string>}>, colorFirst: string | null}} tagState - State object to pass to processTag.
 * @param {{start: number, end: number} | null} frontMatterIndices - Pre-computed YAML block line indices, or null if absent.
 * @returns {string} The final title.
 */
function getInitialTitle(fileContent, initialTitle, regex_tag_match, tagState, frontMatterIndices) {
    let finalTitle = initialTitle;

    if (finalTitle === null) {
        const lines = fileContent.split(/\r?\n/);
        const result = findFirstContentLine(lines, 0, frontMatterIndices);
        finalTitle = result ? result.lineText.substring(0, 180) : '';
    } else {
        // Markdown H1 *was* found. Check it for tags.
        const titleTagMatches = finalTitle.matchAll(regex_tag_match);

        // regex_tag_match groups: 2 = tag parent, 3 = tag child
        for (const [, , parentValue, childValue] of titleTagMatches) {
            processTag({ childValue, parentValue }, tagState);
        }
    }

    return finalTitle.substring(0, 180); // maxed out at 180 characters
}

/**
 * Extracts a short content preview, skipping the H1 title line, YAML front-matter,
 * and leading blank lines. Truncates at whitespace near PEEK_TARGET_CHARS,
 * hard-capped at PEEK_MAX_CHARS.
 *
 * @param {string} fileContent - The full text.
 * @param {string | null} initialTitle - The H1 title found by extractMatches, or null.
 * @param {{start: number, end: number} | null} frontMatterIndices
 * @returns {string} The content preview.
 */
function getContentPeek(fileContent, initialTitle, frontMatterIndices) {
    const lines = fileContent.split(/\r?\n/);

    const h1LineIndex = initialTitle !== null
        ? lines.findIndex(line => /^# /.test(line))
        : -1;
    const startIndex = h1LineIndex !== -1 ? h1LineIndex + 1 : 1;

    const firstLine = findFirstContentLine(lines, startIndex, frontMatterIndices);
    if (!firstLine) return '';

    const yamlStart = frontMatterIndices?.start ?? -1;
    const yamlEnd = frontMatterIndices?.end ?? -1;
    let text = '';

    for (let i = firstLine.lineIndex; i < lines.length; i++) {
        if (yamlStart !== -1 && i >= yamlStart && i <= yamlEnd) continue;
        const line = lines[i].trim();
        if (line !== '') text += (text ? '\n' : '') + line;
        if (text.length >= PEEK_MAX_CHARS) break;
    }

    if (text.length <= PEEK_TARGET_CHARS) return text;
    const spaceIndex = text.indexOf(' ', PEEK_TARGET_CHARS);
    if (spaceIndex === -1 || spaceIndex >= PEEK_MAX_CHARS) return text.substring(0, PEEK_MAX_CHARS);
    return text.substring(0, spaceIndex);
}
