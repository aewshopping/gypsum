import { state, resetState } from './state.js';
import { processTags } from './tags.js';
import { addClickHandlers } from './events.js';
import { createFileElement, clearOutput, getById } from './dom.js';
import { TAG_JOINER } from './constants.js';

function parseFileContent(fileContent, filename) {
    let mytitle = "";
    const regex_title = /(?<=^# ).*$/gm;
    let checktitle = fileContent.match(regex_title);
    if (checktitle != null) { mytitle = checktitle[0]; }

    const regex_tag = /(?<=#)(\w+)\b(?!\/)|#(\w+)\/(\w*\b)/g;
    let matchAll = fileContent.matchAll(regex_tag);
    let matchAll_arr = Array.from(matchAll);
    let tagarray = [];
    let tag_html = [];
    let parent = "";
    let child = "";

    for (let p = 0; p < matchAll_arr.length; p++) {
        for (let u = 1; u === 1 || u === 3; u += 2) {
            if (typeof matchAll_arr[p][u] != 'undefined') {
                const tagvalue = matchAll_arr[p][u].toLowerCase();
                if (!tagarray.includes(tagvalue)) {
                    tagarray[p] = tagvalue;
                    tag_html[p] = `<code><span class="tag ${tagarray[p]}">${tagarray[p]}</span></code>`;
                }
                state.data_tags.push(tagvalue);
            }
        }

        for (let u = 2; u === 2 || u === 3; u++) {
            const string = matchAll_arr[p][u];
            if (typeof string != 'undefined') {
                if (u == 2) { parent = string.toLowerCase(); }
                if (u == 3) { child = string.toLowerCase(); }
            }
        }
        if (parent != "" && child != "") { state.taxon_array.push([parent, child]); }
    }

    let summary_color = "";
    const regex_color = /#color\/(\w+)/m;
    let checkcolor = fileContent.match(regex_color);
    if (checkcolor != null) { summary_color = checkcolor[1]; }

    let tag_html_output = tag_html.join(TAG_JOINER);
    let tag_classes = tagarray.join(" ");

    return { fileContent, summary_color, tag_html_output, tag_classes };
}

function allFilesLoaded() {
    const taxonomy_html_string = processTags();
    getById('tag_output').innerHTML = taxonomy_html_string;
    addClickHandlers();
}

export function loadFile(files) {
    clearOutput();
    resetState();

    const outputDiv = getById('output');
    let filesLoaded = 0;

    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        if (file) {
            let reader = new FileReader();
            let myfilename = file.name;

            reader.onload = function (e) {
                const fileContent = e.target.result;
                const parsedData = parseFileContent(fileContent, myfilename);

                const fileElement = createFileElement(parsedData, myfilename, parsedData.tag_html_output, parsedData.tag_classes);
                outputDiv.appendChild(fileElement);

                filesLoaded++;
                if (filesLoaded === files.length) {
                    allFilesLoaded();
                }
            };
            reader.readAsText(file);
        }
    }
}
