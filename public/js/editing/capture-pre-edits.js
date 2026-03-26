/**
 * Returns the text content of the contenteditable pre in the modal, or null if absent.
 * Used to capture in-progress edits before the content state changes.
 * @returns {string|null}
 */
export function capturePreEdits() {
    const pre = document.querySelector('#modal-content-text pre[contenteditable="true"]');
    return pre ? pre.innerText : null;
}
