import { regex_title, regex_tag } from '../../constants.js';
import { parseYaml } from '../yaml-slop.js';
import { updateMyFileProperties } from '../file-props.js';


export async function getFileDataAndMetadata(handle, loadOrder) {

    const file = await handle.getFile();
    const content = await file.text();
    const tagData = parseFileContent(content);
    const yamlData = parseYaml(content);
    updateMyFileProperties(yamlData,2);

    return {
        handle: handle,
        filename: file.name,
        sizeInBytes: file.size,
        title: tagData.titleFirst,
        tags_parent: tagData.parentArray,
        tags: tagData.childArray,
        color: tagData.colorFirst,
        lastModified: new Date(file.lastModified),
        id: loadOrder,
        ...(yamlData),
        show: true
    };

}

const regex_pattern = `${regex_title.source}|${regex_tag.source}`;
const regex_all = new RegExp(regex_pattern, "gm");
const regex_tag_match = new RegExp(regex_tag.source, "gm");

/**
 * MAIN FUNCTION: Parses file content to find title, unique tags, and first color tag.
 *
 * @param {string} fileContent - The text content of the file.
 * @returns {{titleFirst: string, parentArray: string[], childArray: string[], colorFirst: string | null}} - Extracted data.
 */
function parseFileContent(fileContent) {
    // State Initialization
    let tagState = {
        childSet: new Set(), // Set for unique checks
        childArray: [],      // Array of unique child tags
        parentArray: [],     // Array of corresponding parent tags
        colorFirst: null,    // First color tag found
    };

    // 1. Extract Matches function and get Initial Title
    const { titleFirst: initialTitle } = extractMatches(fileContent, regex_all, regex_tag_match, tagState);

    // 2. Finalize Title - use first line if no defined title (and check it for tags if markdown H1 was present)
    const titleFirst = getInitialTitle(fileContent, initialTitle, regex_tag_match, tagState);

    // 3. Return results
    return {
        titleFirst: titleFirst.trim(), // Ensure final title is trimmed
        parentArray: tagState.parentArray,
        childArray: tagState.childArray,
        colorFirst: tagState.colorFirst,
    };
}

/**
 * Processes a single potential tag (childValue/parentValue pair).
 * Pushes unique tags onto the arrays and handles first color extraction.
 *
 * @param {{childValue: string, parentValue: string | undefined}} tagInfo - The tag parts.
 * @param {{childSet: Set<string>, childArray: string[], parentArray: string[], colorFirst: string | null}} tagState - State object for accumulating tag data.
 */
function processTag({ childValue, parentValue }, tagState) {
    if (!childValue) return;

    const { childSet, childArray, parentArray } = tagState;
    const lowerChild = childValue.toLowerCase();

    // Check if the tag is new for this file.
    if (!childSet.has(lowerChild)) {
        childSet.add(lowerChild);

        const lowerParent = (parentValue || "orphan").toLowerCase();
        parentArray.push(lowerParent);
        childArray.push(lowerChild);

        // Handle color tag extraction. This could be duplicated / improved for other special case tags in future...
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
 * @param {{childSet: Set<string>, childArray: string[], parentArray: string[], colorFirst: string | null}} tagState - State object to pass to processTag.
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
 * Determines the final title, falling back to the first line if no markdown title is found.
 * Also checks the final title for any lurking tags
 *
 * @param {string} fileContent - The full text.
 * @param {string | null} initialTitle - The first title found by extractMatches.
 * @param {RegExp} regex_tag_match - Regex specifically for tags.
 * @param {{childSet: Set<string>, childArray: string[], parentArray: string[], colorFirst: string | null}} tagState - State object to pass to processTag.
 * @returns {string} The final title.
 */
function getInitialTitle(fileContent, initialTitle, regex_tag_match, tagState) {
    let finalTitle = initialTitle;

    if (finalTitle === null) {
        // No markdown H1 found, fallback to the first line of the file
        finalTitle = fileContent.split(/\r?\n/)[0].trim().substring(0, 180);
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