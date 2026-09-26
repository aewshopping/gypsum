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
 * plans/completed/table-cell-writing.md §3.
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
 * **The promise is the text, not the value.** A column's type lives in gypsum, not in the note, and
 * the parser reads a file before any type is applied — so `note: 42` comes back as the number
 * forty-two whatever the column says, and there is nothing quoting can do about that which the
 * reader would notice. What quoting is for is the text that comes back *different*: `007` reads as
 * `7`, `1.50` as `1.5`, `+3` as `3`. Rather than list the shapes that do it, it asks the parser's
 * own coercion what this text would print as — a second list would agree on the day it was written
 * and drift after. A date needs no mention: the parser never builds one, so date text is already
 * itself.
 *
 * One rule for a value and for one item of a list, which is what stops an edit to one item of
 * `[1, 2, 10]` quietly turning a note's list of numbers into a list of strings.
 *
 * @param {string} text - The value's own text, already trimmed.
 * @param {boolean} [inFlow=false] - True for an item inside a flow list (`tags: [a, b]`), where a
 *   comma, a bracket or a quote ends the item. An item in a block list runs to the end of its line
 *   and needs none of that.
 * @returns {boolean}
 */
export function needsQuoting(text, inFlow = false) {
    if (breaksBlock(text, inFlow)) return true;

    // The one coercion that does not show up as different text, because it shows up as no text at
    // all: `null` and `~` are read as nothing, and a cell draws nothing for them. Someone who typed
    // the word meant the word.
    if (coerceValue(text) === null) return true;

    return String(coerceValue(text)) !== text;
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

    // A dash followed by a space makes the line a list item — the parser's own test, so that an
    // ordinary negative number is not quoted for looking like one. A hash opens a comment, a quote
    // a quoted value that then does not end where it should, and a bracket a flow list.
    if (/^-(\s|$)/.test(text)) return true;
    if (/^[#["']/.test(text)) return true;

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
 * **What the file already says at this key is kept**, rather than a style being chosen here: a
 * quoted value stays quoted, a flow list stays a flow list, and a block list keeps the indentation
 * the note was written with. So editing one cell of a note leaves it looking like the same note,
 * and nothing arrives in it that nobody typed.
 *
 * **Only a number has anything to decide.** Written plainly it reads back as the number it looks
 * like, which is what a number column is for — unless the key was quoted already, where keeping the
 * file's own answer wins.
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
 * **An empty value is no text after the colon, and that is how the key is told to go.** Every other
 * answer here carries the separating space, so an empty string is a thing this function can say and
 * nothing else can mean: plan-file-edits.js reads it as "take the key and its line out", which is the
 * mirror of appending a key the note did not have. It is why nothing here has to know about deleting,
 * and why an undo — which sends a record's `before` back as plain text — removes a key it created
 * without a second path through the writer.
 *
 * @param {string} text - What was captured from the cell.
 * @param {string} type - The column's type, one of VALUE_TYPES' values.
 * @param {object} [shape] - What the file already looks like at this key, or nothing for a key it
 *   does not have yet.
 * @param {string} [shape.form] - The form of its value, as parseYaml's span reports it. Only 'flow'
 *   means anything here; a key with no value has none, and gets a block list.
 * @param {string} [shape.itemPrefix='  - '] - What it puts before an item of this list, the dash
 *   included — `'  - '`, `'- '`, a tab. Two spaces where there is nothing to copy.
 * @param {boolean} [shape.quoted] - Whether its value is quoted today.
 * @returns {string} The text after the colon, the separating space included — or '' for an empty
 *   value, meaning the key itself should go.
 */
export function toYamlText(text, type, shape = {}) {
    if (type === VALUE_TYPES.ARRAY.value) {
        return listText(splitFlowItems(text), shape.form, shape.itemPrefix ?? '  - ');
    }

    const trimmed = text.trim();

    // Before the quoting rule, and before the file's own style: a value that was there and is not
    // any more is not a value to write in a style. Ahead of shape.quoted in particular, or clearing
    // a cell the note had quoted would write '""' back and keep the key alive.
    if (trimmed === '') return '';

    if (shape.quoted) return ` ${quoteYaml(trimmed)}`;

    if (type === VALUE_TYPES.NUMBER.value && typeof coerceValue(trimmed) === 'number') {
        return ` ${trimmed}`;
    }

    return ` ${needsQuoting(trimmed) ? quoteYaml(trimmed) : trimmed}`;
}

/**
 * One item of a list, quoted if it needs to be.
 *
 * Exported because writing one item into a list that is otherwise untouched is the splice's job,
 * and the rule for what an item has to look like is this file's. The rule is the same one a value
 * gets; only the flow list's own punctuation is extra.
 *
 * @param {string} item - The item's own text.
 * @param {boolean} inFlow - True when it is going into a flow list.
 * @returns {string}
 */
export function toYamlItem(item, inFlow) {
    return needsQuoting(item, inFlow) ? quoteYaml(item) : item;
}

/**
 * A list as the text after its key's colon.
 *
 * **A list with nothing left in it writes nothing at all**, whatever form it had — which is this
 * file's way of saying the key goes with it. It used to write `[]`, because a block list with no
 * items has no lines to be written on and a bare `people:` opens a nested map the parser then prunes,
 * so an emptied list had to leave *something* or the key would outlive the column. Now the key does
 * not outlive it: plan-file-edits.js takes the key and its line out, and the column stays because the
 * layout asked for it rather than because a file still mentions it.
 *
 * @param {string[]} items - The items, in order.
 * @param {string} [form] - 'flow' keeps a flow list a flow list; anything else is block form.
 * @param {string} itemPrefix - What goes before each item of a block list.
 * @returns {string}
 */
function listText(items, form, itemPrefix) {
    if (items.length === 0) return '';
    if (form === 'flow') return ` [${items.map(item => toYamlItem(item, true)).join(', ')}]`;
    return items.map(item => `\n${itemPrefix}${toYamlItem(item, false)}`).join('');
}
