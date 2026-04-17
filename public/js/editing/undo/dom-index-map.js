/**
 * @file Pure DOM<->character-index utilities for the `<pre>` editor.
 *
 * The editor's innerHTML is an alternating sequence of escaped text nodes and
 * `<br>` elements (fileContentRender() emits this shape). A character index
 * into liveRaw is: sum of preceding text-node lengths, plus one per preceding
 * `<br>`. These helpers translate between that flat index and DOM (node,
 * offset) positions.
 */

/**
 * Converts a StaticRange (from beforeinput.getTargetRanges()) into character
 * offsets in liveRaw. Returns null if the range's containers are outside preEl.
 * @param {StaticRange|Range} range
 * @param {HTMLElement} preEl
 * @returns {{from: number, to: number}|null}
 */
export function rangeToOffsets(range, preEl) {
    const from = nodeOffsetToIndex(range.startContainer, range.startOffset, preEl);
    const to = nodeOffsetToIndex(range.endContainer, range.endOffset, preEl);
    if (from === null || to === null) return null;
    return { from, to };
}

/**
 * Reads the current window selection as liveRaw offsets.
 * @param {HTMLElement} preEl
 * @returns {{from: number, to: number}|null}
 */
export function selectionToOffsets(preEl) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0);
    if (!preEl.contains(r.startContainer) || !preEl.contains(r.endContainer)) return null;
    return rangeToOffsets(r, preEl);
}

/**
 * Places the caret at a flat character offset within preEl.
 * @param {HTMLElement} preEl
 * @param {number} offset
 * @returns {void}
 */
export function setSelectionAtOffset(preEl, offset) {
    setSelectionRange(preEl, offset, offset);
}

/**
 * Places the selection spanning [from, to] within preEl.
 * @param {HTMLElement} preEl
 * @param {number} from
 * @param {number} to
 * @returns {void}
 */
export function setSelectionRange(preEl, from, to) {
    const start = indexToNodeOffset(preEl, from);
    const end = from === to ? start : indexToNodeOffset(preEl, to);
    if (!start || !end) return;
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

/**
 * @param {Node} node
 * @returns {number}
 */
function flatLength(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.data.length;
    if (node.nodeName === 'BR') return 1;
    return (node.textContent || '').length;
}

/**
 * Converts a (container, offset) position to a flat index into liveRaw.
 * Container may be a text node (offset = character index), preEl (offset =
 * childNode boundary index), or a nested element (rare; walk it).
 * @param {Node} container
 * @param {number} offset
 * @param {HTMLElement} preEl
 * @returns {number|null}
 */
function nodeOffsetToIndex(container, offset, preEl) {
    if (container === preEl) {
        let index = 0;
        for (let i = 0; i < offset && i < preEl.childNodes.length; i++) {
            index += flatLength(preEl.childNodes[i]);
        }
        return index;
    }
    if (!preEl.contains(container)) return null;

    let index = 0;
    for (const child of preEl.childNodes) {
        if (child === container) {
            return index + offset;
        }
        if (child.nodeType === Node.ELEMENT_NODE && child.contains(container)) {
            return index + offsetWithinElement(child, container, offset);
        }
        index += flatLength(child);
    }
    return null;
}

/**
 * Walks a nested element subtree summing text/BR lengths until `target` is
 * reached, then adds `offset`.
 * @param {Element} root
 * @param {Node} target
 * @param {number} offset
 * @returns {number}
 */
function offsetWithinElement(root, target, offset) {
    let index = 0;
    function walk(node) {
        if (node === target) {
            index += offset;
            return true;
        }
        if (node.nodeType === Node.TEXT_NODE) {
            index += node.data.length;
            return false;
        }
        if (node.nodeName === 'BR') {
            index += 1;
            return false;
        }
        for (const child of node.childNodes) {
            if (walk(child)) return true;
        }
        return false;
    }
    walk(root);
    return index;
}

/**
 * Converts a flat character index into (node, offset) inside preEl. Prefers
 * text-node positions; uses preEl-level offsets adjacent to `<br>` elements.
 * @param {HTMLElement} preEl
 * @param {number} target
 * @returns {{node: Node, offset: number}|null}
 */
function indexToNodeOffset(preEl, target) {
    let index = 0;
    const children = preEl.childNodes;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.nodeType === Node.TEXT_NODE) {
            const len = child.data.length;
            if (target <= index + len) {
                return { node: child, offset: target - index };
            }
            index += len;
        } else if (child.nodeName === 'BR') {
            if (target === index) return { node: preEl, offset: i };
            index += 1;
            if (target === index) return { node: preEl, offset: i + 1 };
        } else {
            const len = (child.textContent || '').length;
            if (target <= index + len) return { node: preEl, offset: i };
            index += len;
        }
    }
    return { node: preEl, offset: preEl.childNodes.length };
}
