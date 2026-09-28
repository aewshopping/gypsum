import { CORE_FILE_PROPERTIES, FILE_PROPERTIES } from './store.js';
import { RESERVED_KEYS } from './file-parsing/file-info.js';
import { parseYaml } from './file-parsing/yaml-parse.js';
import { WRITABLE_CORE_PROPERTIES } from './property-type.js';

/**
 * @file Whether a name can be given to a property: the rename dialog's question, and the copy
 * dialog's, asked on every keystroke. Pure — the folder's keys are handed in rather than read from appState — so the whole
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
    return textProblem(trimmed) ?? appNameProblem(trimmed);
}

/**
 * What is wrong with a trimmed, non-empty name as the text of a key, whoever owns it.
 * @param {string} trimmed
 * @returns {string|null}
 */
function textProblem(trimmed) {
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
    return null;
}

/**
 * Whether a trimmed name is one the app keeps for itself: a property it fills in, a key it reserves,
 * or a built-in column's label.
 * @param {string} trimmed
 * @returns {string|null}
 */
function appNameProblem(trimmed) {
    const lower = trimmed.toLowerCase();
    if ([...CORE_FILE_PROPERTIES, ...RESERVED_KEYS].some(key => key.toLowerCase() === lower)) {
        return `"${trimmed}" is set by the app`;
    }
    // A built-in column headed by a label rather than its name — `size` is sizeInBytes, `file` is
    // internalId — would stand beside a property of that name as two columns read the same. Only the
    // app's own labels: one a layouts file was hand-edited to give is left alone, rather than read the
    // file for it. plans/completed/table-rename-column.md §4.2, rule 8.
    const labelled = [...FILE_PROPERTIES].find(([, schema]) => schema.label?.toLowerCase() === lower);
    if (labelled) return `"${trimmed}" is the name of a built-in column`;
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

/**
 * What is wrong with copying the column `source` into the property `target`, or null when it can be
 * done. plans/completed/table-copy-column.md §3.5.
 *
 * Unlike a rename, **an existing name is the point** — it is overwritten — so only a name that
 * differs from one in the notes by case alone is refused: `Status` beside `status` would be a second
 * key that reads as the same one. `title` and `color` are the app's names that a note can also hold
 * as keys, so they are the two it lets a copy write; every other one it fills in itself, and several
 * are reserved keys that would lock every note written.
 *
 * @param {string} source - The column being copied: a property, or a linked column's key.
 * @param {string} target - What was typed.
 * @param {Map<string, Map<string, number>>} keys - keysIgnoringCase(files), with nothing left out.
 * @param {{via: string}|null} [linked] - The linked column's definition, when the source is one.
 * @returns {string|null} A sentence for the dialog, or null.
 */
export function copyTargetProblem(source, target, keys, linked = null) {
    const name = target.trim();
    if (name === '') return 'a name is needed';
    if (name === source) return `"${name}" is the column being copied`;
    if (linked && name === linked.via) {
        return `"${name}" holds this column's links — copying into it would replace them`;
    }

    const problem = textProblem(name) ?? (WRITABLE_CORE_PROPERTIES.includes(name) ? null : appNameProblem(name));
    if (problem) return problem;

    const spellings = keys.get(name.toLowerCase());
    if (!spellings || spellings.has(name)) return null;
    const [spelling] = spellings.keys();
    return `"${name}" differs only in case from "${spelling}", which notes already have`;
}
