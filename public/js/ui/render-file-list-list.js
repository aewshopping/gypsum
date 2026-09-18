/**
 * @file The list view: one collapsible entry per file, with every property it carries inside.
 *
 * **What the file object holds, shown as it stands** — that is the whole brief. Every value goes
 * through `renderValue`, which asks the value what it is rather than asking the layouts file what
 * its column was set to: tags are pills because a pill is a filter, a list is one comma-joined
 * line, the app's own date carries its time, and everything else is its own escaped text. Before,
 * this file printed `${value}` and got `[object Map]` for tags, a raw `Date` for last modified, the
 * word "null" for an empty key and no escaping at all.
 *
 * **A column's type is not consulted, and that is the point.** It is the table's fact — it decides
 * how a column sorts and which editor a cell opens — and while this view read it, retyping a table
 * column from list to text changed what this view said about the same note. Nothing here is
 * editable, nothing here reaches the cell machinery: it renders, and that is all.
 */

import { appState } from '../services/store.js';
import { renderTags } from './ui-functions-render/render-tags.js';
import { escapeHtml } from './ui-functions-render/escape-html.js';
import { renderValue } from './ui-functions-render/render-value.js';
import { checkFileOnPage } from './pagination/check-file-on-page.js';
import { PAGINATION_SIZE } from '../constants.js';

/** Properties with nothing to show: a file handle, and the flag the search leaves on a file. */
const NOT_SHOWN = ['handle', 'show'];

/**
 * One `<li>` for a property.
 *
 * `data-prop` is what the search highlighter finds, and `data-list` what the item marks are laid
 * on — the same two marks the table's cells carry, so both are found by the one pass in
 * list-highlight.js. A value is a list when it is an array, which is the same question `renderValue`
 * answers when it draws one. Nothing may sit between the span and its text: the item ranges are
 * measured from the first child node.
 *
 * @param {string} name - The property key.
 * @param {object} file - The file object.
 * @returns {string} The HTML for that row of the list.
 */
function renderProperty(name, file) {
    const list = Array.isArray(file[name]) ? ' data-list' : '';

    return `<li><strong>${escapeHtml(name)}:</strong> ` +
           `<span data-prop="${name}"${list}>${renderValue(file[name])}</span></li>`;
}

/**
 * Renders the list of files as an ordered list.
 * Each list item is a `<details>` element, with the filename and tags in the `<summary>`.
 * The content of the `<details>` element is a nested list of the file's properties.
 * @param {boolean} renderEverything - A flag to render all files or only the filtered ones.
 */
export function renderFileList_list(renderEverything) {
    const startNumber = (appState.paginationState.currentPage - 1) * PAGINATION_SIZE + 1;
    let file_html = `<ol class="list-view" start="${startNumber}">`;

    for (const file of appState.myFiles) {
        if (checkFileOnPage(file.internalId)) {

            // The path rather than the name, which is what the table's filename column shows too —
            // as plain text here, since a file is named the same whether or not it is in italics.
            const filename_html = escapeHtml(file.filepath || file.filename || '');

            let tag_pills_html = ""
            for (const tag of file.tags.keys()) {
                tag_pills_html += renderTags(tag);
            }

            const properties = Object.keys(file)
                .filter(name => !NOT_SHOWN.includes(name))
                .map(name => renderProperty(name, file))
                .join('');

            file_html += `
                <li data-vt-id="${file.internalId}">
                    <details>
                        <summary><span data-prop="filename">${filename_html}</span> ${tag_pills_html}</summary>
                        <ul>
                        <li><span class="show-content-tag color-dynamic" data-color="${file.color}" data-file-id="${file.internalId}" data-action="open-file-content-modal" data-tip="open file">open</span></li>
                        ${properties}
                        </ul>
                    </details>
                </li>`;
        }
    }

    file_html += `</ol>`;
    document.getElementById('output').innerHTML = file_html;
}
