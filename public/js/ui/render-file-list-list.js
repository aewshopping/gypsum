/**
 * @file The list view: one collapsible entry per file, with every property it carries inside.
 *
 * **A value looks the same here as it does in the table**, because it is drawn by the same
 * function — `renderCellValue`, asked for its plain form (see render-cell-value.js). A date shows
 * the note's own words, a list is one comma-joined line with its items marked, a mismatched value
 * shows its text rather than a blank, and everything from a file is escaped. Before, this file
 * printed `${value}` and got `[object Map]` for tags, a raw `Date` for last modified and no
 * escaping at all.
 *
 * **Plain, because nothing here is editable.** The table's file column wears an open-file link and
 * its filename is italic; neither is about the value, and this view has its own open control, so
 * the id reads as the id and the filename as text. There is no caret anywhere in this view and no
 * cell machinery behind it: this renders, and that is all.
 */

import { appState } from '../services/store.js';
import { propertyType, typeMismatch } from '../services/property-type.js';
import { renderTags } from './ui-functions-render/render-tags.js';
import { escapeHtml } from './ui-functions-render/escape-html.js';
import { renderCellValue, rendersAsList } from './ui-functions-table/render-cell-value.js';
import { checkFileOnPage } from './pagination/check-file-on-page.js';
import { PAGINATION_SIZE } from '../constants.js';

/** Properties with nothing to show: a file handle, and the flag the search leaves on a file. */
const NOT_SHOWN = ['handle', 'show'];

/**
 * One `<li>` for a property, drawn the way the table would draw it.
 *
 * `data-prop` is what the search highlighter finds, and `data-list` what the item marks are laid
 * on — the same two marks the table's cells carry, so both are found by the one pass in
 * list-highlight.js. Nothing may sit between the span and its text: the item ranges are measured
 * from the first child node.
 *
 * @param {string} name - The property key.
 * @param {object} file - The file object.
 * @returns {string} The HTML for that row of the list.
 */
function renderProperty(name, file) {
    const column = { name, type: propertyType(name) };
    const mismatch = typeMismatch(file[name], column.type);
    const list = rendersAsList(column, file, mismatch) ? ' data-list' : '';

    return `<li><strong>${escapeHtml(name)}:</strong> ` +
           `<span data-prop="${name}"${list}>${renderCellValue(column, file, mismatch, true)}</span></li>`;
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
