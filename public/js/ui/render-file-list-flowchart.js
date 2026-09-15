/**
 * @file Renders the file list as mermaid flowchart source in a copyable code block.
 *
 * Version 1 stops one step short of drawing the diagram: it writes the syntax out so it can be
 * pasted into a mermaid editor elsewhere. The block is contenteditable purely so it can be
 * selected, copied and tweaked in place — nothing is read back out of it and no note is written.
 */

import { appState } from '../services/store.js';
import { checkFileOnPage } from './pagination/check-file-on-page.js';
import { resolveNoteName } from '../services/internal-links/note-name-index.js';
import { escapeHtml } from './ui-functions-render/escape-html.js';

/**
 * Makes a string safe inside a mermaid "quoted label". Mermaid has no backslash escape, so a
 * double quote has to become the entity it understands.
 * @param {string} text - The raw label text.
 * @returns {string} The text with quotes replaced by mermaid's entity.
 */
function mermaidLabel(text) {
    return String(text).replace(/"/g, '#quot;');
}

/**
 * Renders the visible files as mermaid flowchart source.
 *
 * Node ids are the file's number on the page, starting at 1 — internalLink holds the raw text from
 * inside [[...]], which is neither normalised nor an internalId, so a link is resolved through
 * resolveNoteName() and then mapped to that number. A target that names no loaded file, or one
 * filtered out or sitting on another page, has no number and gets its own inline node instead.
 * @param {boolean} renderEverything - Render all files or only filtered ones.
 * @returns {void}
 */
export function renderFileList_flowchart(renderEverything) {

    const drawnFiles = appState.myFiles.filter(file => checkFileOnPage(file.internalId));

    // Numbered first, in full, because an edge can point at a file that comes later on the page.
    const fileNumbers = new Map();
    drawnFiles.forEach((file, index) => fileNumbers.set(file.internalId, index + 1));

    const unresolvedNodes = new Map(); // raw target -> node id, so two notes linking to the same
                                       // missing file share one node rather than drawing two
    const lines = ['flowchart TD', ''];

    for (const file of drawnFiles) {
        const number = fileNumbers.get(file.internalId);
        const label = file.title || file.filename;
        lines.push(`  ${number}("${mermaidLabel(label)}")`);

        const linkTexts = Array.isArray(file.internalLinkText) ? file.internalLinkText : [];

        file.internalLink.forEach((target, index) => {
            const targetId = resolveNoteName(target);
            let targetNode = fileNumbers.get(targetId);
            if (targetNode === undefined) {
                // The label is written on the node's first appearance only; after that the bare
                // id refers back to it, which is how mermaid reads a node it has already seen.
                if (unresolvedNodes.has(target)) {
                    targetNode = unresolvedNodes.get(target);
                } else {
                    const nodeId = `u${unresolvedNodes.size + 1}`;
                    unresolvedNodes.set(target, nodeId);
                    targetNode = `${nodeId}("${mermaidLabel(target)}")`;
                }
            }

            const linkText = linkTexts[index];
            const arrow = linkText ? `-->|"${mermaidLabel(linkText)}"|` : '-->';
            lines.push(`  ${number} ${arrow} ${targetNode}`);
        });

        lines.push('');
    }

    const source = lines.join('\n');

    document.getElementById('output').innerHTML =
        `<pre class="flowchart-code" contenteditable="true" spellcheck="false">${escapeHtml(source)}</pre>`;
}
