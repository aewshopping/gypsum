/**
 * @file Renders the file list in peek view: title, content preview, and tags per card.
 */

import { appState } from '../services/store.js';
import { renderTags } from './ui-functions-render/render-tags.js';
import { checkFileOnPage } from './pagination/check-file-on-page.js';

/**
 * Renders the list of files as a grid of cards showing title, content peek, and tags.
 * @param {boolean} renderEverything - Render all files or only filtered ones.
 */
export function renderFileList_peek(renderEverything) {

    let file_html = `<div class="list-lanes">`;

    let index = 0;
    for (const file of appState.myFiles) {
        if (checkFileOnPage(file.id)) {
            index++;

            let tag_pills_html = '';
            for (const tag of file.tags.keys()) {
                tag_pills_html += renderTags(tag);
            }

            const peekHtml = (file.contentPeek || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');

            file_html += `
        <div class="note-grid keyboard-navigable color-dynamic" tabindex="0" data-index="${index}" data-color="${file.color}" data-file-id="${file.id}" data-action="open-file-content-modal" data-vt-id="${file.id}">

            <h3 class="color-dynamic" data-color="${file.color}" data-prop="title">${file.title}</h3>

            <p data-prop="contentPeek">${peekHtml ? peekHtml + '...' : ''}</p>

            <div data-prop="tags">${tag_pills_html}</div>

        </div>`;
        }
    }

    file_html += '</div>';

    document.getElementById('output').innerHTML = file_html;
}
