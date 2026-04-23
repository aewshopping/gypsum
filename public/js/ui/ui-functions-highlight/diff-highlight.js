import { parseContent } from '../../services/parse-content.js';
import { searchContainer } from './treewalker-highlight.js';
import diff from './fast-diff.js'; // Swapped to fast-diff

const DIFF_HIGHLIGHT_NAME = 'diff-old';

/**
 * Identifies indices in the ACTIVE content that are lost, changed, or added-to.
 * Uses fast-diff to handle insertions/deletions without shifting all subsequent lines.
 * @param {string} activeRawContent - The historical snapshot being viewed.
 * @param {string} liveRawContent - The current, up-to-date content.
 * @returns {Array<number>} Indices relative to the activeLines array.
 */
export function getLostOrChangedIndices(activeRawContent, liveRawContent) {
    // 1. NORMALIZE: Force both to use standard \n and trim trailing whitespace
    // This is the most common cause of the "everything changed" bug.
    const activeClean = activeRawContent.replace(/\r\n/g, '\n').trimEnd();
    const liveClean = liveRawContent.replace(/\r\n/g, '\n').trimEnd();

    const diffs = diff(activeClean, liveClean);
    
    let activeLineIndex = 0;
    const affectedIndices = new Set();

    console.group(`%c Diff Analysis `, 'background: #222; color: #bada55');

    for (const [type, text] of diffs) {
        // Use a consistent split
        const linesInChunk = text.split('\n');
        const numNewlines = linesInChunk.length - 1;

        if (type === -1) {
            // REMOVAL (Old version text)
            console.log(`%c [-] Change/Removal at Line ${activeLineIndex}`, 'color: #ff4444');
            for (let i = 0; i <= numNewlines; i++) {
                affectedIndices.add(activeLineIndex + i);
            }
            activeLineIndex += numNewlines;
        } 
        else if (type === 1) {
            // ADDITION (New version text)
            // We only highlight the current line where the addition happened
            console.log(`%c [+] Addition at Line ${activeLineIndex}`, 'color: #44ff44');
            affectedIndices.add(activeLineIndex);
            // activeLineIndex does NOT move
        } 
        else if (type === 0) {
            // EQUAL (Matches perfectly)
            activeLineIndex += numNewlines;
        }
    }

    console.log("Indices to Highlight:", [...affectedIndices]);
    console.groupEnd();

    return [...affectedIndices];
}


/**
 * Applies CSS highlights to the current view based on differences from a previous version.
 */
export function applyDiffHighlights(oldContent, currentContent) {
    CSS.highlights.delete(DIFF_HIGHLIGHT_NAME);

    // Use our updated logic function to get the indices of interest
    const lostOrChangedPositions = getLostOrChangedIndices(oldContent, currentContent);
    if (lostOrChangedPositions.length === 0) return;

    const container = document.getElementById('modal-content-text');
    if (!container) return;

    const oldLines = oldContent.split(/\r?\n/).map(line => line.trimEnd());
    const isTxtMode = document.getElementById('render_toggle').checked;
    const ranges = [];

    if (isTxtMode) {
        // Content is rendered as text nodes separated by <br> elements.
        // Build a line-index → text-node map by walking the child nodes.
        const preEl = container.querySelector('pre.historical-snapshot')
            ?? container.querySelector('pre.text-editor');
        if (!preEl) return;

        const lineNodes = [];
        let currentLineNode = null;
        for (const child of preEl.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                currentLineNode = child;
            } else if (child.nodeName === 'BR') {
                lineNodes.push(currentLineNode);
                currentLineNode = null;
            }
        }
        lineNodes.push(currentLineNode); // last line (or only line when no <br> present)

        for (const pos of lostOrChangedPositions) {
            const node = lineNodes[pos];
            if (!node || node.nodeValue.length === 0) continue;
            const range = new Range();
            range.setStart(node, 0);
            range.setEnd(node, node.nodeValue.length);
            ranges.push(range);
        }
    } else {
        // Handle HTML mode: finding text within rendered elements (headings, list items, etc.)
        const tempDiv = document.createElement('div');
        for (const pos of lostOrChangedPositions) {
            // Retrieve the actual string content from the old version using the index
            const lineToSearch = oldLines[pos];
            if (!lineToSearch) continue;

            // Convert raw markdown/text into HTML, then extract the plain text for searching
            tempDiv.innerHTML = parseContent(lineToSearch);
            const renderedText = tempDiv.textContent.trim();

            // If the line resulted in visible text, search the DOM for it and add to ranges
            if (renderedText) {
                searchContainer(container, renderedText, ranges);
            }
        }
    }

    if (ranges.length > 0) {
        CSS.highlights.set(DIFF_HIGHLIGHT_NAME, new Highlight(...ranges));
    }
}

/**
 * Removes diff highlights from the CSS highlights registry.
 * @returns {void}
 */
export function clearDiffHighlights() {
    CSS.highlights.delete(DIFF_HIGHLIGHT_NAME);
}
