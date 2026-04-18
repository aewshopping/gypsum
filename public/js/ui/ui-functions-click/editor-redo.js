/**
 * @returns {void}
 */
export function handleEditorRedo() {
    const editor = document.querySelector('.text-editor');
    if (editor) editor.focus();
    document.execCommand('redo');
}
