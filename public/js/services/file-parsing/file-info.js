
import { regex_title, regex_tag } from '../../constants.js';
import { parseYaml } from '../yaml-slop.js';

export async function getFileDataAndMetadata(handle, loadOrder) {
    const file = await handle.getFile();
    return await getFileDataAndMetadataFromFile(file, loadOrder, handle);
}

export async function getFileDataAndMetadataFromFile(file, loadOrder, handle = null) {
    const content = await file.text();
    const tagData = parseFileContent(content);
    const yamlData = parseYaml(content);

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

function parseFileContent(fileContent) {
    let tagState = {
        childSet: new Set(),
        childArray: [],
        parentArray: [],
        colorFirst: null,
    };

    const { titleFirst: initialTitle } = extractMatches(fileContent, regex_all, regex_tag_match, tagState);
    const titleFirst = getInitialTitle(fileContent, initialTitle, regex_tag_match, tagState);

    return {
        titleFirst: titleFirst.trim(),
        parentArray: tagState.parentArray,
        childArray: tagState.childArray,
        colorFirst: tagState.colorFirst,
    };
}

function processTag({ childValue, parentValue }, tagState) {
    if (!childValue) return;

    const { childSet, childArray, parentArray } = tagState;
    const lowerChild = childValue.toLowerCase();

    if (!childSet.has(lowerChild)) {
        childSet.add(lowerChild);
        const lowerParent = (parentValue || "orphan").toLowerCase();
        parentArray.push(lowerParent);
        childArray.push(lowerChild);

        if ((lowerParent === "color" || lowerParent === "colour") && tagState.colorFirst === null) {
            tagState.colorFirst = childValue;
        }
    }
}

function extractMatches(fileContent, regex_all, regex_tag_match, tagState) {
    let titleFirst = null;
    const matches = fileContent.matchAll(regex_all);

    for (const [, titleValue, , parentValue, childValue] of matches) {
        if (titleFirst === null && titleValue) {
            titleFirst = titleValue;
        }
        processTag({ childValue, parentValue }, tagState);
    }
    return { titleFirst };
}

function getInitialTitle(fileContent, initialTitle, regex_tag_match, tagState) {
    let finalTitle = initialTitle;

    if (finalTitle === null) {
        finalTitle = fileContent.split(/\r?\n/)[0].trim().substring(0, 180);
    } else {
        const titleTagMatches = finalTitle.matchAll(regex_tag_match);
        for (const [, , parentValue, childValue] of titleTagMatches) {
            processTag({ childValue, parentValue }, tagState);
        }
    }

    return finalTitle.substring(0, 180);
}
