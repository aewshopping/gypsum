import { appState } from '../../services/store.js';
import { parseContent } from '../../services/parse-content.js';
import { searchContainer } from './treewalker-highlight.js';

const DIFF_HIGHLIGHT_NAME = 'diff-old';

/**
 * Returns the 0-indexed positions of lines in oldLines absent from the current version,
 * using Symmetric Difference with Unique Occurrences so that duplicate lines are handled
 * correctly. When lineRefs are available on both sides they are used as keys (more precise);
 * otherwise occurrence counts are computed over the raw line strings.
 * Returns [] only if historicalLineRefs is unavailable.
 * @param {string[]} oldLines
 * @param {string} currentContent
 * @param {number[]|null} historicalLineRefs
 * @returns {number[]}
 */
function getOldOnlyPositions(oldLines, currentContent, historicalLineRefs) {
    if (!historicalLineRefs) return [];

    const currentVersionLineRefs = appState.currentVersionLineRefs;
    if (currentVersionLineRefs) {
        // Primary path: both sides have lineRefs — occurrence-count by ref
        const currentRefCounts = new Map();
        for (const ref of currentVersionLineRefs) {
            currentRefCounts.set(ref, (currentRefCounts.get(ref) ?? 0) + 1);
        }
        const seenInOld = new Map();
        return historicalLineRefs.reduce((acc, ref, i) => {
            if (oldLines[i]?.trim() === '') return acc;
            const occ = (seenInOld.get(ref) ?? 0) + 1;
            seenInOld.set(ref, occ);
            if (occ > (currentRefCounts.get(ref) ?? 0)) acc.push(i);
            return acc;
        }, []);
    }

    // Secondary path: currentVersionLineRefs unavailable — occurrence-count by string
    const currentLineCounts = new Map();
    for (const line of currentContent.split('\n')) {
        currentLineCounts.set(line, (currentLineCounts.get(line) ?? 0) + 1);
    }
    const seenInOld = new Map();
    return oldLines.reduce((acc, line, i) => {
        if (line.trim() === '') return acc;
        const occ = (seenInOld.get(line) ?? 0) + 1;
        seenInOld.set(line, occ);
        if (occ > (currentLineCounts.get(line) ?? 0)) acc.push(i);
        return acc;
    }, []);
}

/**
 * Highlights lines in the content modal present in the old version but absent from current.
 * The diff uses Symmetric Difference with Unique Occurrences via lineRefs from history.gypsum.
 * TXT mode: precise character-offset ranges in the <pre> text node (position-based, no false positives).
 * HTML mode: each old-only raw line is rendered through parseContent() — the same pipeline as the
 * modal — to get its rendered plain text, which is then searched via searchContainer. This finds
 * headings, paragraphs, list items, and YAML frontmatter lines. Lines whose rendered text spans
 * multiple sibling text nodes (e.g. **bold** inline) won't be highlighted.
 * @param {string} oldContent - Raw text of the historical version.
 * @param {string} currentContent - Raw text of the current version (used when lineRefs unavailable).
 * @param {number[]|null} historicalLineRefs - lineRefs from the selected history entry.
 * @returns {void}
 */
export function applyDiffHighlights(oldContent, currentContent, historicalLineRefs) {
    CSS.highlights.delete(DIFF_HIGHLIGHT_NAME);

    const oldLines = oldContent.split('\n');
    const changedPositions = getOldOnlyPositions(oldLines, currentContent, historicalLineRefs);
    if (changedPositions.length === 0) return;

    const container = document.getElementById('modal-content-text');
    if (!container) return;

    const isTxtMode = document.getElementById('render_toggle').checked;
    const ranges = [];

    if (isTxtMode) {
        const preEl = container.querySelector('pre');
        if (!preEl?.firstChild) return;
        const textNode = preEl.firstChild;
        const lines = textNode.nodeValue.split('\n');
        const lineOffsets = [];
        let offset = 0;
        for (const line of lines) {
            lineOffsets.push(offset);
            offset += line.length + 1; // +1 for '\n'
        }
        for (const pos of changedPositions) {
            if (pos >= lines.length || lines[pos].length === 0) continue;
            const range = new Range();
            range.setStart(textNode, lineOffsets[pos]);
            range.setEnd(textNode, lineOffsets[pos] + lines[pos].length);
            ranges.push(range);
        }
    } else {
        const tempDiv = document.createElement('div');
        for (const pos of changedPositions) {
            tempDiv.innerHTML = parseContent(oldLines[pos]);
            const renderedText = tempDiv.textContent.trim();
            if (renderedText) searchContainer(container, renderedText, ranges);
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
