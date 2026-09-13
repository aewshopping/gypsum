import { VALUE_TYPES } from '../../constants.js';
import { coerceValue } from './yaml-parse.js';

/**
 * @file A value's text, made safe to write into a front matter block.
 *
 * Text in, text out: no disk, no state, no DOM. That is the whole point of it being its own file —
 * it can be tested to death before anything can be damaged by it, and it is the piece most likely
 * to be wrong in a way nobody notices for months. Front matter is fussy text: write the wrong shape
 * and you do not lose one value, you lose the block, and the note's other properties go with it.
 *
 * **The policy is quote defensively rather than validate strictly** — accept nearly anything that
 * was typed and make the writing safe instead of policing the typing. See
 * plans/table-cell-writing.md §3.
 *
 * **This is not the rule flow-list.js uses.** That one protects a text box, so `[draft]` goes
 * through it unquoted; this one protects a YAML block, where the same text reads back as a list.
 * Two rules doing different jobs, deliberately kept apart — see
 * plans/completed/table-cell-editors.md §3.2.
 */

/**
 * Whether this text has to be quoted to survive being written into front matter and read back as
 * itself.
 *
 * The last test is the one worth understanding, because it is the group that damages files rather
 * than the group everyone imagines: `007` written plainly reads back as the number seven, and
 * `null` as nothing at all. Rather than list the shapes that do it, it asks the parser's own
 * coercion what this text would come back as — a second list would agree on the day it was written
 * and drift after. A date needs no mention: the parser never builds one, so date text is already
 * itself.
 *
 * @param {string} text - The value's own text, already trimmed.
 * @param {boolean} [inFlow=false] - True for an item inside a flow list (`tags: [a, b]`), where a
 *   comma, a bracket or a quote ends the item. An item in a block list runs to the end of its line
 *   and needs none of that.
 * @returns {boolean}
 */
export function needsQuoting(text, inFlow = false) {
    // `key:` with nothing after it opens a nested map, which the parser prunes — so the key would
    // survive in the file and vanish from the table, taking the column with it if no other note
    // carries it. `""` is an empty value that is still a value.
    if (text === '') return true;

    // The one that destroys the block outright, rather than one value.
    if (/[\r\n]/.test(text)) return true;

    // Splits the line into a new key — and the same shape inside a list item is a key the parser
    // refuses. Both are ': ' or a colon ending the line, which is what the parser itself tests for.
    if (/:(\s|$)/.test(text)) return true;

    // A dash makes the line a list item, a hash a comment, a quote a quoted value that then does
    // not end where it should, and a bracket a flow list.
    if (/^[-#["']/.test(text)) return true;

    if (inFlow && /[,[\]"']/.test(text)) return true;

    return coerceValue(text) !== text;
}

/**
 * The text wrapped in quotes, choosing the character the text does not itself contain.
 *
 * The scanner ends a quoted run at the matching character, so wrapping `a", b` in double quotes
 * would split it back into two items. Wrapping in single quotes does not, and the parser strips
 * only the outermost pair, so an inner quote of the other kind is left alone.
 *
 * Text holding both kinds is wrapped in double quotes anyway: it survives as a scalar, where only
 * the first and last characters are looked at, and as a flow item it is the residual the display
 * rule already admits to.
 *
 * @param {string} text
 * @returns {string}
 */
export function quoteYaml(text) {
    return text.includes('"') && !text.includes("'") ? `'${text}'` : `"${text}"`;
}

/**
 * The text to write into a key's value span: everything after the colon, the separating space
 * included.
 *
 * A scalar's span starts immediately after the colon, so the separator is this function's to
 * supply — which is what lets an empty `title:` be written into exactly as a filled one is.
 *
 * **Only a number has anything to decide.** Written plainly it closes the round trip: `42` typed
 * into a number column comes back as the number forty-two rather than as text that then shows as
 * not matching its column. Text that is not a number is written as text, which is what leaves the
 * cell readable and the column's type the thing to look at.
 *
 * **A date writes no ISO of its own**, and that is the editors plan's decision rather than an
 * omission here: a date cell offers a caret *and* a picker, so typed text is written verbatim and
 * the picker is what produces ISO, before this is ever involved. Nothing here reinterprets a date —
 * see plans/completed/table-cell-editors.md §4.
 *
 * @param {string} text - What was captured from the cell.
 * @param {string} type - The column's type, one of VALUE_TYPES' values.
 * @returns {string}
 */
export function toYamlText(text, type) {
    const trimmed = text.trim();

    if (type === VALUE_TYPES.NUMBER.value && typeof coerceValue(trimmed) === 'number') {
        return ` ${trimmed}`;
    }

    return ` ${needsQuoting(trimmed) ? quoteYaml(trimmed) : trimmed}`;
}
