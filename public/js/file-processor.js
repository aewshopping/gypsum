import { state, resetState, Data } from './state.js';
import { processTags } from './tags.js';
import { addClickHandlers } from './events.js';
import { createFileElement, clearOutput, getById } from './dom.js';
import { TAG_JOINER } from './constants.js';

function parseFileContent(fileContent, filename) {
    let mytitle = "";
    const regex_title = /(?<=^# ).*$/gm;
    let checktitle = fileContent.match(regex_title);
    if (checktitle != null) { mytitle = checktitle[0]; }

    // find all the tags used in the files
    const regex_tag = /(?<=#)(\w+)\b(?!\/)|#(\w+)\/(\w*\b)/g;   // Note "# Title" with a space is <h1>; #tag with no space is a tag [old (?<=#)\w*\b - no taxonomy]
    let matchAll = fileContent.matchAll(regex_tag);
    let matchAll_arr = Array.from(matchAll);
    let tagarray = [];
    let tag_html = [];
    let parent = "";
    let child = "";

    for (let p = 0; p < matchAll_arr.length; p++) {
        // only have two capturing groups to test for tag matches (note that with matchAll array[0] will be the match which we don't want, we want grp 1 and grp 3)
        for (let u = 1; u === 1 || u === 3; u += 2) {
            if (typeof matchAll_arr[p][u] != 'undefined') {
                const tagvalue = matchAll_arr[p][u].toLowerCase();
                if (!tagarray.includes(tagvalue)) { // check we don't have the same tag twice in this file
                    tagarray[p] = tagvalue;
                    tag_html[p] = `<code><span class="tag ${tagarray[p]}">${tagarray[p]}</span></code>`;
                }
                state.data_tags.push(tagvalue); // retain duplicates here to allow later count
            }
        }

        // BUG - NEED TO AMEND BELOW TO NOT STORE DUPLICATE TAGS OR PARENTS
        // now getting capturing grp 2 and grp 3 for parent child relationships
        for (let u = 2; u === 2 || u === 3; u++) {
            const string = matchAll_arr[p][u];
            if (typeof string != 'undefined') {
                if (u == 2) { parent = string.toLowerCase(); }
                if (u == 3) { child = string.toLowerCase(); }
            }
        }
        if (parent != "" && child != "") { state.taxon_array.push([parent, child]); }
    }

    // this is to allow users to select a color by applying a color tag to the file
    let summary_color = "";
    const regex_color = /#color\/(\w+)/m; // note that this works because it doesn't have the global g flag
    let checkcolor = fileContent.match(regex_color);
    if (checkcolor != null) { summary_color = checkcolor[1]; }

    let tag_html_output = tag_html.join(TAG_JOINER); // to show in summary element
    let tag_classes = tagarray.join(" "); // to include in details element class list

    return { fileContent, summary_color, tag_html_output, tag_classes, mytitle, tagarray };
}

function allFilesLoaded() {
    // do stuff after all files have been loaded, called in last file load below
    const taxonomy_html_string = processTags();
    getById('tag_output').innerHTML = taxonomy_html_string;
    addClickHandlers();
}

export function loadFile(files) {
    clearOutput();
    resetState();

    const outputDiv = getById('output');
    let filesLoaded = 0;

    // load in all the files...
    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        if (file) {
            let reader = new FileReader();
            let myfilename = file.name;
            let lastModDate = file.lastModifiedDate;

            // this is the async function will runs each time a file is finished loading
            reader.onload = function (e) {
                const fileContent = e.target.result;
                const parsedData = parseFileContent(fileContent, myfilename);

                // object not being used right now
                state.data.push(new Data(myfilename, parsedData.mytitle, lastModDate, fileContent, parsedData.tagarray));

                const fileElement = createFileElement(parsedData, myfilename, parsedData.tag_html_output, parsedData.tag_classes);
                outputDiv.appendChild(fileElement);

                filesLoaded++;
                // if it is the last file, do stuff after it is all loaded
                if (filesLoaded === files.length) {
                    allFilesLoaded();
                }
            };
            reader.readAsText(file); // this calls the async reader.onload function so don't put anything after this
        }
    }
}
