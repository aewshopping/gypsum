import { regex_title, regex_tag } from '../../constants.js';
import { parseYaml } from '../yaml-slop.js'

export async function getFileDataAndMetadata(handle) {

    const file = await handle.getFile();
    const content = await file.text();
    const tagData = parseFileContent(content);
    const yamlData = parseYaml(content);

    return {
    handle: handle,
    name: file.name,
    sizeInBytes: file.size,
    title: tagData.titleFirst,
    tags_parent: tagData.parentArray,
    tags: tagData.childArray,
    lastModified: new Date(file.lastModified),
    content_properties: yamlData
    };
}

// this function goes through the text of the file and finds any titles (starting with '# '), tags (ie #tag) and tag taxonomy (ie '#parent/tag')
function parseFileContent(fileContent) {

    const regex_pattern = `${regex_title.source}|${regex_tag.source}`;
    const regex_all = new RegExp(regex_pattern, "gm");

    const matchAll = fileContent.matchAll(regex_all);
    const matchAllArray = Array.from(matchAll);

    let titleFirst = null;
    const parentArray = [];
    const childArray = [];

    // using above regex 0 = match, 1 = grp(# title), 2 = grp(#all), 3 = grp(parent), 4 = grp(child)
    // skipping 0 and 2 as not needed below (needed elsewhere tho so still in regex) 
    for (const [, titleValue, , parentValue, childValue] of matchAllArray) {

        if (titleFirst === null && titleValue) {
            titleFirst = titleValue;
        }

        if (childValue) {
            
            parentArray.push(parentValue || "orphan"); // <-- if no parent captured use "orphan"
            childArray.push(childValue);
        }
    }

    return{titleFirst, parentArray, childArray}
}