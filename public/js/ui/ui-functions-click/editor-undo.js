/**
 * @returns {void}
 */
export function handleEditorUndo() {
    const editor = document.querySelector('.text-editor');
    if (editor) editor.focus();
    document.execCommand('undo');
}
