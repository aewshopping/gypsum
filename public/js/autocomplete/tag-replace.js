/**
 * Replaces the '#query' token before the caret with '#selectedTag'.
 * Extends the selection backward to cover '#' + query, then uses execCommand('insertText')
 * to replace — identical to insert-date-shortcut.js, producing a single undoable step.
 * @param {string} query - The partial tag text already typed (without '#').
 * @param {string} selectedTag - The chosen full tag (without '#').
 * @returns {void}
 */
export function replaceEditorTag(query, selectedTag) {
    const sel = window.getSelection();
    for (let i = 0; i < query.length + 1; i++) {
        sel.modify('extend', 'backward', 'character');
    }
    document.execCommand('insertText', false, '#' + selectedTag);
}

/**
 * Replaces the partial query after 'tags:' in the searchbox with selectedTag.
 * @param {HTMLInputElement} inputEl
 * @param {string} selectedTag
 * @param {number} triggerStart - Index of first char of partial query (after 'tags:').
 * @returns {void}
 */
export function replaceSearchboxTag(inputEl, selectedTag, triggerStart) {
    const before = inputEl.value.slice(0, triggerStart);
    const after  = inputEl.value.slice(inputEl.selectionStart);
    inputEl.value = before + selectedTag + after;
    const newCaret = triggerStart + selectedTag.length;
    inputEl.setSelectionRange(newCaret, newCaret);
}
