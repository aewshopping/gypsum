import { VALUE_TYPES } from '../../constants.js';
import { coerceValue } from './yaml-parse.js';
import { splitFlowItems } from './flow-list.js';

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
 * Two halves. The first is the text that would break the block, and it is the same for a value and
 * for one item of a list. The second is the group that damages files rather than the group everyone
 * imagines: `007` written plainly reads back as the number seven, and `null` as nothing at all.
 * Rather than list the shapes that do it, it asks the parser's own coercion what this text would
 * come back as — a second list would agree on the day it was written and drift after. A date needs
 * no mention: the parser never builds one, so date text is already itself.
 *
 * @param {string} text - The value's own text, already trimmed.
 * @param {boolean} [inFlow=false] - True for an item inside a flow list (`tags: [a, b]`), where a
 *   comma, a bracket or a quote ends the item. An item in a block list runs to the end of its line
 *   and needs none of that.
 * @returns {boolean}
 */
export function needsQuoting(text, inFlow = false) {
    return breaksBlock(text, inFlow) || coerceValue(text) !== text;
}

/**
 * The half of the rule that is about the block's shape rather than about what a value means.
 * @param {string} text - The value's own text, already trimmed.
 * @param {boolean} inFlow - True for an item inside a flow list.
 * @returns {boolean}
 */
function breaksBlock(text, inFlow) {
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

    return inFlow && /[,[\]"']/.test(text);
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
 * **A list keeps the form the file already uses.** The editor's commas are how a list is shown and
 * typed, never a reason to rewrite a block list as a flow one — so the form and the indentation the
 * file chose are passed in rather than decided here. The one place a style is chosen is a key that
 * has no list to copy one from.
 *
 * @param {string} text - What was captured from the cell.
 * @param {string} type - The column's type, one of VALUE_TYPES' values.
 * @param {string} [form] - The form the key's value already has, as parseYaml's span reports it.
 *   Only 'flow' means anything here; a key with no value yet has none, and gets a block list.
 * @param {string} [itemPrefix='  - '] - What the file already puts before an item of this list,
 *   the dash included — `'  - '`, `'- '`, a tab. Two spaces where there is nothing to copy.
 * @returns {string}
 */
export function toYamlText(text, type, form, itemPrefix = '  - ') {
    if (type === VALUE_TYPES.ARRAY.value) return listText(splitFlowItems(text), form, itemPrefix);

    const trimmed = text.trim();

    if (type === VALUE_TYPES.NUMBER.value && typeof coerceValue(trimmed) === 'number') {
        return ` ${trimmed}`;
    }

    return ` ${needsQuoting(trimmed) ? quoteYaml(trimmed) : trimmed}`;
}

/**
 * One item of a list, quoted if it needs to be.
 *
 * **An item has to come back as the same text, where a value has to come back as the same value** —
 * a weaker promise, and the right one here. A list is text in the editor and values in the file, so
 * `1` coming back as the number one is inherent rather than a fault (§5.1) and quoting it would
 * quietly turn a note's list of numbers into a list of strings. `007` is a different matter: it
 * comes back as `7`, which is not what anyone typed.
 *
 * Exported because writing one item into a list that is otherwise untouched is the splice's job,
 * and the rule for what an item has to look like is this file's.
 *
 * @param {string} item - The item's own text.
 * @param {boolean} inFlow - True when it is going into a flow list.
 * @returns {string}
 */
export function toYamlItem(item, inFlow) {
    const quote = breaksBlock(item, inFlow) || String(coerceValue(item)) !== item;
    return quote ? quoteYaml(item) : item;
}

/**
 * A list as the text after its key's colon.
 *
 * **A list with nothing left in it is written `[]`**, whatever form it had. A block list with no
 * items has no lines to be written on, and a bare `people:` opens a nested map that the parser then
 * prunes — so the key would survive in the file and the column would vanish from the table.
 *
 * @param {string[]} items - The items, in order.
 * @param {string} [form] - 'flow' keeps a flow list a flow list; anything else is block form.
 * @param {string} itemPrefix - What goes before each item of a block list.
 * @returns {string}
 */
function listText(items, form, itemPrefix) {
    if (items.length === 0) return ' []';
    if (form === 'flow') return ` [${items.map(item => toYamlItem(item, true)).join(', ')}]`;
    return items.map(item => `\n${itemPrefix}${toYamlItem(item, false)}`).join('');
}
