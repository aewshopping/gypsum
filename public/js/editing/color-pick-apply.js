import { getEditorElement } from './manage-unsaved-changes.js';
import { selectTextRange } from './editor-selection.js';
import { decodeModalHtml } from '../services/file-save.js';
import { findFrontMatterIndices } from '../services/file-parsing/yaml-find.js';
import { parseYaml } from '../services/file-parsing/yaml-parse.js';
import { toYamlText } from '../services/file-parsing/yaml-value-write.js';
import { keySplice } from './front-matter-splice.js';
import { VALUE_TYPES } from '../constants.js';

/**
 * Types `written` over the editor's current selection, the way the browser would.
 *
 * **Newlines go in through `insertLineBreak`, never inside the inserted text.** `insertText` with a
 * '\n' in it builds `<div>` wrappers, and the editor is not made of those: `decodeModalHtml` reads
 * only `<br>` and literal newlines, so saving a note the picker had added a line to wrote the markup
 * into the file. That was live — the old picker appended '\n\n#color/…' this way, and a note with no
 * colour yet came out of the editor holding `<div>#color/coral</div>` as text.
 *
 * The runs coalesce into one undo entry, so Ctrl+Z still takes the whole colour back in one press —
 * which is the reason any of this goes through execCommand rather than a write to disk.
 *
 * An empty string is a deletion, and says so outright: `insertText` with '' is not a delete in every
 * engine, and there is nothing to type.
 *
 * @param {string} written
 * @returns {void}
 */
function writeIntoEditor(written) {
    if (written === '') {
        document.execCommand('delete');
        return;
    }

    const lines = written.split('\n');
    lines.forEach((line, index) => {
        if (line) document.execCommand('insertText', false, line);
        if (index < lines.length - 1) document.execCommand('insertLineBreak');
    });
}

/**
 * Sets the note's `color:` front matter key to the chosen colour, in the text of the open editor.
 *
 * **It edits the editor rather than the file, and that is the whole point.** `execCommand` is what
 * puts the change on the browser's own undo stack, so one Ctrl+Z in the file-content modal takes the
 * colour back — which a write to disk could not offer. The cost is that nothing is saved until the
 * user saves, the same as any other typing.
 *
 * It used to write a `#color/…` tag into the body, which made every colour a tag as well: a pastel
 * showed a pill reading `ffbdbd` beside the real tags, "no colour" wrote a literal `#color/nocolor`,
 * and the table's colour cell — which writes front matter — silently beat it. One key, one writer.
 *
 * **Where the bytes go is front-matter-splice.js's answer**, shared with the cell writer, so the
 * picker creates a block, appends a key or clears one by exactly the rules a cell edit follows.
 *
 * @param {string} colorName - The chosen colour as it should appear in the note: a named colour
 *   bare, a hex with its '#'. The literal 'nocolor' removes the key.
 * @param {number} savedOffset - The cursor offset captured before the picker took focus.
 * @returns {number} That offset, moved by the edit when the edit was above it.
 */
export function applyColorToEditor(colorName, savedOffset) {
    const editorEl = getEditorElement();
    if (!editorEl) return savedOffset;

    // Read through decodeModalHtml, the same as the save path, so offsets here are the offsets
    // editor-selection.js counts — it treats a <br> as one character for exactly this reason.
    const text = decodeModalHtml(editorEl.innerHTML);
    const indices = findFrontMatterIndices(text);

    // Errors are not collected: a block that did not read cleanly still gives usable spans for the
    // keys it did read, and the alternative — refusing to colour a note over an unrelated bad line —
    // helps nobody. The splice only ever touches this one key.
    const spans = new Map();
    parseYaml(text, [], spans, indices);

    const raw = colorName === 'nocolor' ? '' : toYamlText(colorName, VALUE_TYPES.STRING.value, {});
    const splice = keySplice(text, 'color', raw, indices, spans.get('color'));
    if (!splice) return savedOffset;   // asked for no colour, and there was none

    selectTextRange(editorEl, splice.start, splice.end);
    writeIntoEditor(splice.written);

    const delta = splice.written.length - (splice.end - splice.start);
    return splice.start < savedOffset ? savedOffset + delta : savedOffset;
}
