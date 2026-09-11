import { findFrontMatterIndices } from "./yaml-find.js";

const SPACE = 32;
const TAB = 9;
const HASH = 35;
const DASH = 45;
const OPEN_BRACKET = "[";
const CLOSE_BRACKET = "]";

/**
 * Coerces a string value into its appropriate JavaScript type (null, boolean, number, or string).
 * Handles quoted strings to preserve them as strings.
 * @param {string} value The string value to coerce.
 * @returns {null|boolean|number|string} The coerced value.
 */
const coerceValue = (value) => {
    const trimmed = value.trim();

    if (trimmed === "null" || trimmed === "~") return null;
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;

    const first = trimmed.charCodeAt(0);
    const last = trimmed.charCodeAt(trimmed.length - 1);
    const quoted = trimmed.length >= 2 &&
        ((first === 34 && last === 34) || (first === 39 && last === 39));

    // Quoted values bypass number coercion, so "12" stays the text 12.
    if (quoted) return trimmed.slice(1, -1).trim();

    // Only a value opening with a digit, sign or decimal point can be a number. Checking the
    // first character before calling Number() also keeps 'Infinity' a string, which Number()
    // would otherwise turn into a value no cell can display.
    if ((first >= 48 && first <= 57) || first === 45 || first === 43 || first === 46) {
        const asNumber = Number(trimmed);
        if (!Number.isNaN(asNumber)) return asNumber;
    }

    return trimmed;
};

/**
 * Index one past the last non-whitespace character of a line. Used so a span never swallows a
 * trailing '\r', which a splice would then delete from a CRLF file.
 * @param {string} line - The line to measure.
 * @returns {number} The index at which the line's content ends.
 */
const contentEnd = (line) => {
    let end = line.length;
    while (end > 0 && /\s/.test(line[end - 1])) end--;
    return end;
};

/**
 * Splits the inside of a flow list into its item ranges, ignoring commas inside quotes.
 * One scanner serves both the values and their spans, so the two cannot disagree about where
 * an item begins and ends.
 *
 * @param {string} line - The line holding the list.
 * @param {number} from - Index just past the opening bracket.
 * @param {number} to - Index of the closing bracket.
 * @returns {Array<{start: number, end: number}>} One range per item, whitespace trimmed off each.
 */
const flowItemRanges = (line, from, to) => {
    const ranges = [];
    let start = from;
    let quote = "";

    const push = (end) => {
        let a = start;
        let b = end;
        while (a < b && /\s/.test(line[a])) a++;
        while (b > a && /\s/.test(line[b - 1])) b--;
        if (b > a) ranges.push({ start: a, end: b });
    };

    for (let i = from; i < to; i++) {
        const character = line[i];
        if (quote) {
            if (character === quote) quote = "";
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }
        if (character === ",") {
            push(i);
            start = i + 1;
        }
    }
    push(to);
    return ranges;
};

/**
 * Removes keys left holding an empty object — a key whose nesting was expected but never
 * arrived. Post-order, so a map emptied by this pass is itself removed by it.
 * @param {object} target - The object to prune, mutated in place.
 * @returns {void}
 */
const pruneEmptyMaps = (target) => {
    for (const key of Object.keys(target)) {
        const value = target[key];
        if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
        pruneEmptyMaps(value);
        if (Object.keys(value).length === 0) delete target[key];
    }
};

/**
 * Simple YAML Parser - vibe coded by google gemini 30 Sept 2025
 * A lightweight YAML parser for basic front-matter data extraction.
 *
 * Reads keys, nested maps, block lists (indented or flush with their key) and flow lists
 * (`tags: [a, b]`). Anything else is out of scope by design; see plans/completed/yaml-parser.md.
 *
 * The parser is forgiving: a line it cannot make sense of is skipped rather than thrown on.
 * Pass an array as `errors` to find out which lines those were.
 *
 * @param {string} yamlString - The raw content string.
 * @param {string[]} [errors] - Collects a short reason per skipped line. Mutated in place.
 * @param {Map<string, object>} [spans] - When given, collects one entry per top-level key
 *   describing where its value sits in `yamlString`, for editing a value in place. See
 *   §5 of plans/completed/yaml-parser.md for the shape and what each part is for. Spans describe the
 *   text, not the result: a key pruned from the returned object still has its span.
 * @param {{start: number, end: number} | null} [indices] - Pre-computed block position, for
 *   callers that already have it. Defaults to finding it; pass null to say there is none.
 * @returns {object} The parsed JavaScript object.
 */
export const parseYaml = (
    yamlString,
    errors = [],
    spans = null,
    indices = findFrontMatterIndices(yamlString),
) => {
    if (!indices) return {};

    const lines = yamlString.split("\n");
    const root = {};
    const stack = [{ container: root, indent: -1, key: null, parent: null, span: null }];

    // Character offset of the line being read, carried forward rather than recomputed, so a
    // span can point into the original text without the parser holding a second copy of it.
    let offset = 0;
    for (let i = 0; i <= indices.start; i++) offset += lines[i].length + 1;

    // The span of the top-level key currently being read. Every line consumed before the next
    // top-level key belongs to its value, so each one extends it.
    let openSpan = null;

    for (let i = indices.start + 1; i < indices.end; i++) {
        const line = lines[i];
        const lineStart = offset;
        offset += line.length + 1;

        let indent = 0;
        while (indent < line.length &&
               (line.charCodeAt(indent) === SPACE || line.charCodeAt(indent) === TAB)) indent++;

        const trimmed = line.slice(indent).trim();
        if (trimmed === "" || trimmed.charCodeAt(0) === HASH) continue;

        const lineEnd = lineStart + contentEnd(line);

        // The dash is checked before the colon, so '- apple: red' is read as a list item rather
        // than as a key named '- apple'.
        const isListItem = trimmed.charCodeAt(0) === DASH &&
            (trimmed.length === 1 || trimmed.charCodeAt(1) === SPACE);

        if (isListItem) {
            // Strictly shallower, where a key line pops on equal indentation too. That one
            // character is what lets a list sit flush with the key that owns it.
            while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop();
            const context = stack[stack.length - 1];

            if (context.key === null) {
                errors.push(`no parent key for list item: ${trimmed}`);
                continue;
            }

            let list = context.container;
            if (!Array.isArray(list)) {
                if (Object.keys(list).length > 0) {
                    errors.push(`list item under a key that already holds values: ${trimmed}`);
                    continue;
                }
                list = [];
                context.container = list;
                context.parent[context.key] = list;
            }

            if (openSpan) {
                openSpan.valueEnd = lineEnd;
                if (context.span === openSpan) openSpan.form = "block";
            }

            const itemText = trimmed.slice(1).trim();
            if (itemText === "") {
                const item = {};
                list.push(item);
                stack.push({ container: item, indent, key: null, parent: null, span: null });
                continue;
            }

            // A quoted item may hold a colon of its own — '- "due: friday"' is one value.
            const itemQuoted = itemText.length >= 2 &&
                ((itemText.startsWith('"') && itemText.endsWith('"')) ||
                 (itemText.startsWith("'") && itemText.endsWith("'")));
            if (!itemQuoted && /:(\s|$)/.test(itemText)) {
                errors.push(`list item holding a key is not supported: ${trimmed}`);
            }
            list.push(coerceValue(itemText));

            if (openSpan && context.span === openSpan) {
                // Found rather than assumed: a non-breaking space counts as neither indentation
                // nor content, so the dash is not always at `indent`.
                let valueStart = line.indexOf("-", indent) + 1;
                while (valueStart < line.length &&
                       (line.charCodeAt(valueStart) === SPACE || line.charCodeAt(valueStart) === TAB)) valueStart++;
                openSpan.items.push({
                    lineStart,
                    valueStart: lineStart + valueStart,
                    valueEnd: lineEnd,
                });
            }
            continue;
        }

        while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
        const context = stack[stack.length - 1];

        if (Array.isArray(context.container)) {
            errors.push(`key inside a list is not supported: ${trimmed}`);
            continue;
        }

        const colon = trimmed.indexOf(":");
        if (colon === -1) {
            errors.push(`unrecognised line: ${trimmed}`);
            continue;
        }

        const key = trimmed.slice(0, colon).trim();
        const valueText = trimmed.slice(colon + 1).trim();
        const isTopLevel = stack.length === 1;
        // The key cannot itself contain a colon, so the first one at or after the indentation
        // is the one that separates it from its value.
        const rawColon = line.indexOf(":", indent);

        if (!isTopLevel && openSpan) {
            openSpan.valueEnd = lineEnd;
            if (openSpan.form === "scalar") openSpan.form = "map";
        }

        let span = null;
        if (spans && isTopLevel) {
            span = {
                valueStart: lineStart + rawColon + 1,
                valueEnd: lineEnd,
                form: "scalar",
                items: [],
            };
            spans.set(key, span);
            openSpan = span;
        } else if (isTopLevel) {
            openSpan = null;
        }

        if (valueText === "") {
            const nested = {};
            context.container[key] = nested;
            stack.push({ container: nested, indent, key, parent: context.container, span });
            continue;
        }

        const opensFlow = valueText.charAt(0) === OPEN_BRACKET;
        if (opensFlow && valueText.charAt(valueText.length - 1) === CLOSE_BRACKET) {
            const open = line.indexOf(OPEN_BRACKET, rawColon + 1);
            const close = line.lastIndexOf(CLOSE_BRACKET);
            const ranges = flowItemRanges(line, open + 1, close);
            context.container[key] = ranges.map(range => coerceValue(line.slice(range.start, range.end)));
            if (span) {
                span.form = "flow";
                span.items = ranges.map(range => ({
                    lineStart,
                    valueStart: lineStart + range.start,
                    valueEnd: lineStart + range.end,
                }));
            }
            continue;
        }

        // Only when there is no closing bracket anywhere. A value like '[draft] needs work'
        // has one, just not at the end, and is ordinary prose rather than a broken list.
        if (opensFlow && !valueText.includes(CLOSE_BRACKET)) {
            errors.push(`unclosed flow list: ${trimmed}`);
        }
        context.container[key] = coerceValue(valueText);
    }

    pruneEmptyMaps(root);
    return root;
};
