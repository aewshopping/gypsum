/**
 * Inserts today's date (yyyy-mm-dd) at the cursor position in the text editor.
 * Called when F5 is pressed while the editor element is focused.
 * @returns {void}
 */
export function handleInsertDateShortcut() {
    const today = new Date();
    const dateString = today.getFullYear()
        + '-' + String(today.getMonth() + 1).padStart(2, '0')
        + '-' + String(today.getDate()).padStart(2, '0');
    document.execCommand('insertText', false, dateString);
}
