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
 * Replaces the '[[query' token before the caret with a complete '[[selectedNote]]',
 * leaving the caret after the closing brackets. Same execCommand approach as
 * replaceEditorTag, so it lands as a single undoable step.
 * @param {string} query - The partial note name already typed (without '[[').
 * @param {string} selectedNote - The chosen note name, including its extension.
 * @returns {void}
 */
export function replaceEditorLink(query, selectedNote) {
    const sel = window.getSelection();
    for (let i = 0; i < query.length + 2; i++) { // + 2 for the '[[' itself
        sel.modify('extend', 'backward', 'character');
    }
    document.execCommand('insertText', false, '[[' + selectedNote + ']]');
}

/**
 * Replaces the searchbox text from triggerStart to the caret with text, leaving the caret after it.
 * A tag replaces the partial query after 'tags:'; a property replaces everything from index 0, its
 * '/' included.
 * @param {HTMLInputElement} inputEl
 * @param {string} text
 * @param {number} triggerStart - Index of the first char being replaced.
 * @returns {void}
 */
export function replaceSearchboxQuery(inputEl, text, triggerStart) {
    const before = inputEl.value.slice(0, triggerStart);
    const after  = inputEl.value.slice(inputEl.selectionStart);
    inputEl.value = before + text + after;
    const newCaret = triggerStart + text.length;
    inputEl.setSelectionRange(newCaret, newCaret);
}
