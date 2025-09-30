export async function getFileDataAndMetadata(handle) {

    const file = await handle.getFile();
    const content = await file.text();
    parseFileContent(content);
    
    return {
    handle: handle,
    name: file.name,
    sizeInBytes: file.size,
    lastModified: new Date(file.lastModified)
    };
}

function parseFileContent(fileContent) {

    // match the text on a line that starts with '# ' - grp 1
    const regex_title = /(?<=^# )(.*$)/;
    // grp 1 - the whole #string, grp 2 - the parent text (if exists), grp 3 - the tag text
    const regex_tag = /(#(?:(\w+)\/)?(\w+))/;
    const regex_pattern = `${regex_title.source}|${regex_tag.source}`;
    const regex_all = new RegExp(regex_pattern, "gm");
    console.log(regex_all);

    const matchAll = fileContent.matchAll(regex_all);
    console.log(Array.from(matchAll));
    console.log("hi");
}