import { getEditorElement } from './manage-unsaved-changes.js';
import { selectTextRange } from './editor-selection.js';
import { decodeModalHtml } from '../services/file-save.js';
import { findFrontMatterIndices } from '../services/file-parsing/yaml-find.js';
import { parseYaml } from '../services/file-parsing/yaml-parse.js';
import { toYamlText } from '../services/file-parsing/yaml-value-write.js';
import { keySplice } from './front-matter-splice.js';
import { VALUE_TYPES } from '../constants.js';

/**
 * Sets the note's `color:` front matter key to the chosen colour, in the text of the open editor.
 *
 * **It edits the editor rather than the file, and that is the whole point**: `execCommand` puts the
 * change on the browser's own undo stack, which a write to disk could not offer. Nothing is saved
 * until the user saves, the same as any other typing.
 *
 * It used to write a `#color/…` body tag, which made every colour a tag as well and left the table's
 * colour cell — which writes front matter — silently beating it. One key, one writer. Where the bytes
 * go is front-matter-splice.js's answer, shared with that cell.
 *
 * @param {string} colorName - The colour as the note should hold it: a named colour bare, a hex with
 *   its '#'. The literal 'nocolor' removes the key.
 * @param {number} savedOffset - The cursor offset captured before the picker took focus.
 * @returns {number} That offset, moved by the edit when the edit was above it.
 */
export function applyColorToEditor(colorName, savedOffset) {
    const editorEl = getEditorElement();
    if (!editorEl) return savedOffset;

    // Read as the save path reads, so these offsets are the ones editor-selection.js counts.
    const text = decodeModalHtml(editorEl.innerHTML);
    const indices = findFrontMatterIndices(text);

    // Errors are not collected: a block with one bad line still gives usable spans for the keys that
    // did read, and refusing to colour a note over an unrelated line helps nobody.
    const spans = new Map();
    parseYaml(text, [], spans, indices);

    const raw = colorName === 'nocolor' ? '' : toYamlText(colorName, VALUE_TYPES.STRING.value, {});
    const splice = keySplice(text, 'color', raw, indices, spans.get('color'));
    if (!splice) return savedOffset;   // asked for no colour, and there was none

    // One insertText for every shape, including '' for a key being cleared, which deletes the
    // selection. Keeps the whole edit on the browser's undo stack as a single entry.
    selectTextRange(editorEl, splice.start, splice.end);
    document.execCommand('insertText', false, splice.written);

    const delta = splice.written.length - (splice.end - splice.start);
    return splice.start < savedOffset ? savedOffset + delta : savedOffset;
}
