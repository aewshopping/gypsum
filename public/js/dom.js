import { NOTE, COPYTHIS, COPYATTR } from './constants.js';
import { markdownParser } from './markdown-parser.js';

export const getById = (id) => document.getElementById(id);

export const qs = (selector) => document.querySelector(selector);

export const qsa = (selector) => document.querySelectorAll(selector);

export function createFileElement(fileData, myfilename, tag_html_output, tag_classes) {
    let parsedText = markdownParser(fileData.fileContent);
    parsedText = marked.parse(parsedText);

    const file_html = `<details class="${NOTE} ${tag_classes}">
        <summary data-color="${fileData.summary_color}"><span class="copyhighlight"><span class="${COPYTHIS}" title='copy filename to clipboard' data-${COPYATTR}='${myfilename}'>©</span> ${myfilename}</span><br>
        ${tag_html_output}
        </summary>
        ${parsedText}<br><br><br>
    </details>`;

    return new DOMParser().parseFromString(file_html, 'text/html').body.firstChild;
}

export function clearOutput() {
    getById('output').innerHTML = '';
    getById('tag_output').innerHTML = '';
}
