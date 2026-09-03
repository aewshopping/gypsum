import { getEditorElement } from './manage-unsaved-changes.js';
import { selectTextRange } from './editor-selection.js';
import { decodeModalHtml } from '../services/file-save.js';
import { regex_color } from '../constants.js';

/**
 * Replaces the first #color/ tag in the editor with the chosen colour, or appends
 * one on a new line at the end if none exists. Returns the adjusted cursor offset.
 * Uses execCommand to preserve the browser's native undo stack.
 * Reads content via decodeModalHtml (same as save path) to avoid innerText/<br> ambiguity.
 * @param {string} colorName
 * @param {number} savedOffset
 * @returns {number}
 */
export function applyColorToEditor(colorName, savedOffset) {
    const editorEl = getEditorElement();
    if (!editorEl) return savedOffset;

    const text = decodeModalHtml(editorEl.innerHTML);
    const newTag = `#color/${colorName}`;
    const match = regex_color.exec(text);

    if (match) {
        const oldTag = match[0];
        selectTextRange(editorEl, match.index, match.index + oldTag.length);
        document.execCommand('insertText', false, newTag);
        const delta = newTag.length - oldTag.length;
        return match.index < savedOffset ? savedOffset + delta : savedOffset;
    }

    const endRange = document.createRange();
    endRange.selectNodeContents(editorEl);
    endRange.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(endRange);
    // The line breaks go in via insertLineBreak, not as "\n" inside the inserted text:
    // execCommand wraps an inserted newline in a <div>, which the save path does not
    // translate, so it would land in the file as literal markup.
    document.execCommand('insertLineBreak');
    document.execCommand('insertLineBreak');
    document.execCommand('insertText', false, `#color/${colorName}`);
    return savedOffset;
}
