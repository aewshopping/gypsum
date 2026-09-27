import { CORE_FILE_PROPERTIES } from './store.js';
import { RESERVED_KEYS } from './file-parsing/file-info.js';
import { parseYaml } from './file-parsing/yaml-parse.js';

/**
 * @file Whether a name can be given to a property: the rename dialog's question, asked on every
 * keystroke. Pure — the folder's keys are handed in rather than read from appState — so the whole
 * rule is tested in node. plans/completed/table-rename-column.md §4.2–§4.4.
 *
 * Two readers are protected, as the quoting rule protects them (yaml-value-write.js): gypsum's own
 * parser, asked last as the authority, and a spec reader such as Obsidian or PyYAML, which reads a
 * key starting `[` or `&` as something other than a key.
 */

/** YAML indicators a key must not start with: a spec reader would see a list, a flow collection, an
 * alias, a tag, a comment or a quoted scalar. */
const INDICATORS = '#-?[]{},&*!|>\'"%@`';

/** Characters the app writes unescaped into the table header's HTML and its `[data-property]`
 * selectors. Not a YAML problem — the app's own. §4.2, rule 6. */
const MARKUP = '"<>&';

/**
 * What is wrong with `name` as a property name, or null when nothing is. Trims it first. The same
 * name as `from` is not a problem — there is just nothing to do — and the caller decides that; a
 * change of case is a different name, since keys are case-sensitive.
 *
 * @param {string} name - What was typed.
 * @param {string} from - The property being renamed.
 * @returns {string|null} A sentence for the dialog, or null.
 */
export function propertyNameProblem(name, from) {
    const trimmed = name.trim();
    if (trimmed === '') return 'a name is needed';
    if (trimmed === from) return null;

    if (trimmed.includes(':')) return 'a name cannot contain ":"';
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f]/.test(trimmed)) return 'a name cannot contain a line break or a control character';
    if (INDICATORS.includes(trimmed[0])) return `a name cannot start with "${trimmed[0]}"`;
    if (trimmed.includes(' #')) return 'a name cannot contain " #"';
    const markup = [...trimmed].find(char => MARKUP.includes(char));
    if (markup) return `a name cannot contain "${markup}"`;

    // Last of the text rules, and the authority: whatever the rules above let through, gypsum must
    // read back as exactly this one key. This is also what refuses `__proto__` — assigning that key
    // changes an object's prototype instead of adding a key, so the parser hands back none.
    const errors = [];
    const keys = Object.keys(parseYaml(`---\n${trimmed}: x\n---\n`, errors));
    if (errors.length > 0 || keys.length !== 1 || keys[0] !== trimmed) {
        return `"${trimmed}" cannot be read back as a name`;
    }

    const lower = trimmed.toLowerCase();
    if ([...CORE_FILE_PROPERTIES, ...RESERVED_KEYS].some(key => key.toLowerCase() === lower)) {
        return `"${trimmed}" is set by the app`;
    }
    return null;
}

/**
 * Every key the notes carry, grouped by its lower-cased spelling, with how many notes carry each
 * spelling. Built once when the rename dialog opens, so each keystroke is one lookup. `from` itself
 * is left out: renaming `people` to `People` replaces the name rather than adding a look-alike. §4.4.
 *
 * @param {Array<object>} files - The loaded file objects.
 * @param {string} from - The property being renamed.
 * @returns {Map<string, Map<string, number>>} lower-cased key → spelling → notes carrying it.
 */
export function keysIgnoringCase(files, from) {
    const keys = new Map();
    for (const file of files) {
        for (const key of Object.keys(file)) {
            if (key === from) continue;
            const lower = key.toLowerCase();
            if (!keys.has(lower)) keys.set(lower, new Map());
            const spellings = keys.get(lower);
            spellings.set(key, (spellings.get(key) ?? 0) + 1);
        }
    }
    return keys;
}

/**
 * What is wrong with renaming `from` to `to`, or null when it can be done — or when `to` is `from`,
 * which is nothing to do rather than something wrong. A name any note already has, in any case, is
 * refused: that would be a merge, and a rename is never one. §4.4.
 *
 * @param {string} from - The property being renamed.
 * @param {string} to - What was typed.
 * @param {Map<string, Map<string, number>>} keys - From keysIgnoringCase.
 * @returns {string|null} A sentence for the dialog, or null.
 */
export function renameProblem(from, to, keys) {
    const problem = propertyNameProblem(to, from);
    if (problem) return problem;

    const name = to.trim();
    if (name === from) return null;
    const spellings = keys.get(name.toLowerCase());
    if (!spellings) return null;

    const [spelling, count] = spellings.has(name) ? [name, spellings.get(name)] : [...spellings][0];
    const notes = `${count} note${count === 1 ? '' : 's'}`;
    return spelling === name
        ? `"${name}" is already in ${notes}`
        : `"${name}" is already in ${notes} as "${spelling}"`;
}
