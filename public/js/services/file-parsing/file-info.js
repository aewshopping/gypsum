import { regex_title, regex_tag, regex_internal_link } from '../../constants.js';
import { parseYaml } from './yaml-parse.js';
import { findFrontMatterIndices } from './yaml-find.js';
import { updateMyFilesProperties } from '../file-props.js';
import { findProtectedSpans, isProtected } from './protected-spans.js';
import { yamlSegment } from './file-errors.js';
import { frontMatterLinks } from './front-matter-links.js';

/**
 * @file Extracts metadata from file content, including title, tags, and YAML front matter.
 */

// Front matter is spread over the file object, so a key colliding with one of these would replace
// app-owned data — a bogus `handle` alone breaks save, rename, delete and content search. `tags`
// is handled separately below, merged into the TagMap rather than dropped.
const RESERVED_KEYS = ['handle', 'filename', 'sizeInBytes', 'filepath', 'internalId',
                       'contentPeek', 'internalLink', 'internalLinkText', 'errorOnLoad',
                       'lastModified'];


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
    const yamlErrors = [];
    const yamlData = parseYaml(content, yamlErrors, null, frontMatterIndices);

    // Stripped before registration so a shadowing key never becomes a searchable property either.
    const shadowedKeys = RESERVED_KEYS.filter(key => key in yamlData);
    for (const key of shadowedKeys) delete yamlData[key];

    updateMyFilesProperties(yamlData, 2);

    // Merge YAML tags into the TagMap as orphan tags, then remove from yamlData
    // to prevent the spread from overwriting the TagMap with a plain array.
    //
    // **`in` rather than truthiness, and the delete below is why.** `tags: false`, `tags: 0` and
    // `tags: null` are keys the note carries, and a falsy guard skipped the delete along with the
    // merge — so the spread put a boolean over the TagMap and every view that calls
    // `file.tags.keys()` threw. The table row builder happened to be guarded; the list and the
    // grid were not. A bare `tags:` is safe either way: the parser emits no key at all for it.
    if ('tags' in yamlData) {
        const yamlTags = Array.isArray(yamlData.tags) ? yamlData.tags : [yamlData.tags];
        for (const yamlTag of yamlTags) {
            // null is missing everywhere else in the app, so it is not a tag either. `false` is a
            // value, and becomes the tag "false" the same way `123` becomes "123" — one sentence
            // for the rule rather than a list of shapes that do and do not count.
            if (yamlTag === null || yamlTag === undefined) continue;
            const lowerTag = String(yamlTag).toLowerCase().trim();
            if (lowerTag && !tagData.tagMap.has(lowerTag)) {
                tagData.tagMap.set(lowerTag, { count: 1, parents: new Set() });
            }
        }
        delete yamlData.tags;
    }

    // Front matter is protected from the prose scan, so a [[link]] in a value is collected from
    // the parsed values instead — see CLAUDE.md, *Front matter is data, not prose*. Running it
    // here, after the strips above, gives one rule: a link counts when it sits in a value the
    // file object keeps.
    for (const { target, text } of frontMatterLinks(yamlData)) addLink(tagData.links, target, text);

    return {
        handle: handle,
        filename: file.name,
        sizeInBytes: file.size,
        title: tagData.titleFirst,
        contentPeek: tagData.contentPeek,
        tags: tagData.tagMap,
        // Front matter's alone, the way `title` is: null here, and the spread below supplies it.
        // The note holds the value CSS wants, so nothing normalises it. A `#color/…` tag no longer
        // means anything — see CLAUDE.md, *What a table cell may contain*.
        color: null,
        // Always present, [] when the file has no links: properties are registered from
        // myFiles[0] alone, so omitting the key would unregister it for the whole session.
        // One Map read twice, so index i of each array is the same link — see addLink.
        internalLink: [...tagData.links.keys()],
        internalLinkText: [...tagData.links.values()],
        lastModified: new Date(file.lastModified),
        ...(yamlData),
        // Null rather than absent when the front matter read cleanly, for the same reason as above.
        errorOnLoad: yamlSegment(yamlErrors, shadowedKeys),
    };

}

// The link source is APPENDED, never inserted: group numbers in regex_all are positional and
// extractMatches destructures them, so putting it last leaves title/tag groups 1-3 untouched.
const regex_pattern = `${regex_title.source}|${regex_tag.source}|${regex_internal_link.source}`;
const regex_all = new RegExp(regex_pattern, "gm");
const regex_tag_match = new RegExp(regex_tag.source, "gm");
const regex_link_match = new RegExp(regex_internal_link.source, "gm");

const PEEK_TARGET_CHARS = 100;
const PEEK_MAX_CHARS = 130;

/**
 * The front matter block as a character span, so tags, links and the title skip it the way they
 * already skip markup and code. **Front matter is data, not prose** — see CLAUDE.md.
 *
 * findFrontMatterIndices answers in line numbers, a span is character offsets, so the lines are
 * measured. Split on "\n" rather than /\r?\n/ so a CRLF's '\r' counts inside line.length and the
 * offsets stay aligned — the same reasoning as yaml-parse.js.
 *
 * @param {string} fileContent - The whole file.
 * @param {{start: number, end: number}} indices - The block's opening and closing line, inclusive.
 * @returns {[number, number]} The span as [start, end), covering both separator lines.
 */
function frontMatterSpan(fileContent, indices) {
    const lines = fileContent.split("\n");
    const offsetOf = (line) => lines.slice(0, line).reduce((offset, l) => offset + l.length + 1, 0);
    return [offsetOf(indices.start), offsetOf(indices.end + 1)];
}

/**
 * MAIN FUNCTION: Parses file content to find title and unique tags (as a TagMap).
 *
 * @param {string} fileContent - The text content of the file.
 * @param {{start: number, end: number} | null} frontMatterIndices - Pre-computed YAML block line indices, or null if absent.
 * @returns {{titleFirst: string, contentPeek: string, tagMap: Map<string, {count: number, parents: Set<string>}>, links: Map<string, string>}} - Extracted data.
 */
function parseFileContent(fileContent, frontMatterIndices) {
    let tagState = {
        tagMap: new Map(),  // Map<childTagName, {count: number, parents: Set<string>}>
        links: new Map(),   // target -> display text; see addLink
    };

    // The front matter block joins the markup and code spans, so nothing inside it is read as prose.
    const protectedSpans = findProtectedSpans(fileContent);
    if (frontMatterIndices) protectedSpans.push(frontMatterSpan(fileContent, frontMatterIndices));

    // 1. Extract Matches and get Initial Title
    const { titleFirst: initialTitle } = extractMatches(fileContent, regex_all, tagState, protectedSpans);

    // 2. Finalize Title and Content Preview
    const titleFirst = getInitialTitle(fileContent, initialTitle, regex_tag_match, tagState, frontMatterIndices);
    const contentPeek = getContentPeek(fileContent, initialTitle, frontMatterIndices);

    // 3. Return results
    return {
        titleFirst: titleFirst.trim(),
        contentPeek,
        tagMap: tagState.tagMap,
        links: tagState.links,
    };
}

/**
 * Records one internal link.
 *
 * The Map's key order is the order links are met and its values are those same links' display
 * text, so internalLink and internalLinkText are aligned by construction rather than by two code
 * paths agreeing to stay in step. It is also the dedupe a note linking twice to the same file
 * needs: one entry, in the position of the first mention.
 *
 * **The first non-empty text fills the slot.** A note saying [[shopping.txt]] and later
 * [[shopping.txt|groceries]] means one link, labelled — a later mention can fill an empty slot but
 * never overwrite text already given. A link with no '|' has the text '', never its own target,
 * even though the target is what such a link renders as.
 *
 * @param {Map<string, string>} links - The link Map being filled.
 * @param {string} target - The text inside [[...]], before any '|'.
 * @param {string} text - The display text after '|', already trimmed, or ''.
 */
function addLink(links, target, text) {
    const key = target.trim();
    if (!key) return; // '[[ ]]' is a link to nothing, not a broken link to ''

    const existing = links.get(key);
    if (existing === undefined || (existing === '' && text)) links.set(key, text);
}

/**
 * Processes a single potential tag, adding it to the TagMap.
 * If the child tag already exists, the parent is added to its parents Set (multi-parent support).
 * If the child tag is new, a fresh entry is created.
 *
 * It used to pick a note's colour out of a `#color/…` tag here as well, which made every colour a
 * tag — and, because that ran only in the new-tag branch, a note holding `#coral` first got none.
 *
 * @param {{childValue: string, parentValue: string | undefined}} tagInfo - The tag parts.
 * @param {{tagMap: Map<string, {count: number, parents: Set<string>}>}} tagState - State object for accumulating tag data.
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
    }
}

/**
 * Extracts titles and tags from the file content using matchAll.
 * Updates the tagState and finds the first title.
 *
 * @param {string} fileContent - The text to parse.
 * @param {RegExp} regex_all - Combined regex for title and tags.
 * @param {{tagMap: Map<string, {count: number, parents: Set<string>}>}} tagState - State object to pass to processTag.
 * @param {Array<[number, number]>} protectedSpans - HTML markup spans to skip; see protected-spans.js.
 * @returns {{titleFirst: string | null}} - The first encountered title.
 */
function extractMatches(fileContent, regex_all, tagState, protectedSpans) {
    let titleFirst = null;
    const matches = fileContent.matchAll(regex_all);

    // regex_all groups: 1 = title, 2 = tag parent, 3 = tag child, 4 = internal link target,
    // 5 = that link's display text
    for (const match of matches) {
        const [, titleValue, parentValue, childValue, linkTarget, linkText] = match;

        // 1. Process Title. It checks the spans too, unlike before: a '# ' line inside front matter
        // is a YAML comment and not this note's heading. getInitialTitle's fallback always skipped
        // the block, so without this the two title paths disagreed.
        if (titleFirst === null && titleValue && !isProtected(match.index, protectedSpans)) {
            titleFirst = titleValue;
        }

        // 2. Process Tag
        if (childValue && !isProtected(match.index, protectedSpans)) {
            processTag({ childValue, parentValue }, tagState);
        }

        // 3. Process internal link — same protection check, so links inside code are ignored
        if (linkTarget && !isProtected(match.index, protectedSpans)) {
            addLink(tagState.links, linkTarget, (linkText ?? '').trim());
        }
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
 * @param {{tagMap: Map<string, {count: number, parents: Set<string>}>}} tagState - State object to pass to processTag.
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
        // Markdown H1 *was* found. Check it for tags. finalTitle is a substring of fileContent,
        // so its own protected spans are computed fresh here rather than reusing the
        // fileContent-wide spans, which would be in the wrong coordinate space.
        const titleProtectedSpans = findProtectedSpans(finalTitle);
        const titleTagMatches = finalTitle.matchAll(regex_tag_match);

        // regex_tag_match groups: 1 = tag parent, 2 = tag child
        for (const match of titleTagMatches) {
            const [, parentValue, childValue] = match;
            if (!isProtected(match.index, titleProtectedSpans)) {
                processTag({ childValue, parentValue }, tagState);
            }
        }

        // Links in the title need the same treatment: regex_title matches '(.*$)' after '# ',
        // so the H1 line is consumed whole and the combined regex never sees a '[[link]]' in it.
        for (const match of finalTitle.matchAll(regex_link_match)) {
            const [, linkTarget, linkText] = match;
            if (!isProtected(match.index, titleProtectedSpans)) {
                addLink(tagState.links, linkTarget, (linkText ?? '').trim());
            }
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
    const yamlStart = frontMatterIndices?.start ?? -1;
    const yamlEnd = frontMatterIndices?.end ?? -1;
    const inBlock = (i) => yamlStart !== -1 && i >= yamlStart && i <= yamlEnd;

    // The heading to skip past is the note's, so a '# ' line inside the block is not it. The loop
    // below already skipped the block; finding the heading did not, so the peek began at the comment
    // and then showed the real heading as body text.
    const h1LineIndex = initialTitle !== null
        ? lines.findIndex((line, i) => /^# /.test(line) && !inBlock(i))
        : -1;
    const startIndex = h1LineIndex !== -1 ? h1LineIndex + 1 : 1;

    const firstLine = findFirstContentLine(lines, startIndex, frontMatterIndices);
    if (!firstLine) return '';

    let text = '';

    for (let i = firstLine.lineIndex; i < lines.length; i++) {
        if (inBlock(i)) continue;
        const line = lines[i].trim();
        if (line !== '') {
            text += (text ? '\n' : '') + line;
        } else if (text && !text.endsWith('\n\n')) {
            text += '\n'; // preserve paragraph break; cap at one blank line
        }
        if (text.length >= PEEK_MAX_CHARS) break;
    }

    if (text.length <= PEEK_TARGET_CHARS) return text.trimEnd();
    const spaceIndex = text.indexOf(' ', PEEK_TARGET_CHARS);
    if (spaceIndex === -1 || spaceIndex >= PEEK_MAX_CHARS) return text.substring(0, PEEK_MAX_CHARS).trimEnd();
    return text.substring(0, spaceIndex).trimEnd();
}
