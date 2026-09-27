import { LINKED_KEY_PREFIX } from '../constants.js';
import { appState, FILE_PROPERTIES } from './store.js';

/**
 * @file What each linked column is, and the one writer for it. A linked column shows a property of
 * the note a link points at: "show `read` of the note linked in `via`".
 *
 * The same shape as property-type.js and flowchart-options.js: a Map in appState, readers here, and
 * one writer, so the dialog and a hand-edited layouts file are validated by the same function. What
 * a cell *shows* is not here — that is internal-links/linked-value.js — because this module answers
 * what a column is and that one what it draws. See plans/table-linked-properties.md.
 *
 * No page, no disk.
 */

/** `linked:` and a whole number from 1 up — the only keys nextLinkedKey() hands out. */
const KEY_PATTERN = new RegExp(`^${LINKED_KEY_PREFIX}[1-9]\\d*$`);

/**
 * Whether a column name is a linked column's key rather than a property a note carries. Asked by
 * everything that treats a linked column differently: its type, its caret, its menu, its cells.
 * @param {string} name - A column's name.
 * @returns {boolean}
 */
export function isLinkedKey(name) {
    return typeof name === 'string' && name.startsWith(LINKED_KEY_PREFIX);
}

/**
 * @param {string} key - A linked column's key.
 * @returns {{label: string|null, via: string, read: string}|undefined}
 */
export function linkedProperty(key) {
    return appState.linkedProperties.get(key);
}

/**
 * @returns {string[]} Every linked column's key, in the order they were defined.
 */
export function linkedPropertyKeys() {
    return [...appState.linkedProperties.keys()];
}

/**
 * The heading a linked column is given when nobody has named it: `project → status`, from the
 * labels its two properties already go by.
 * @param {string} via
 * @param {string} read
 * @returns {string}
 */
export function automaticHeading(via, read) {
    const label = (name) => FILE_PROPERTIES.get(name)?.label ?? name;
    return `${label(via)} → ${label(read)}`;
}

/**
 * The heading a linked column is drawn with: its own name, or its automatic one when it has none.
 *
 * **Worked out when asked rather than stored**, so a column nobody named follows its choices —
 * re-pointed from the dialog, or renamed along with a property — with no code of its own.
 *
 * @param {string} key - A linked column's key.
 * @returns {string}
 */
export function linkedHeading(key) {
    const definition = linkedProperty(key);
    if (!definition) return key;
    return definition.label ?? automaticHeading(definition.via, definition.read);
}

/**
 * A definition as the app keeps it, or null when it cannot be one. Pure, so the rule is tested in
 * node: the layouts file is hand-editable, and anything that is not an object with a non-empty
 * string `via` and `read` is dropped rather than guessed at. A `label` that is not a non-empty
 * string is read as none, so the column is named after its choices.
 *
 * @param {*} raw - A `linkedProperties` entry as parsed from the file, or the dialog's choices.
 * @returns {{label: string|null, via: string, read: string}|null}
 */
export function readDefinition(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const { via, read, label } = raw;
    if (typeof via !== 'string' || via === '' || typeof read !== 'string' || read === '') return null;
    // Neither may name another linked column: that is the chaining this feature rules out. §3.4.
    if (isLinkedKey(via) || isLinkedKey(read)) return null;
    const named = typeof label === 'string' && label.trim() !== '' ? label.trim() : null;
    return { label: named, via, read };
}

/**
 * Records a linked column, or forgets it when given no definition.
 *
 * **The one way into appState.linkedProperties.** The dialog's save reaches it, a property rename
 * reaches it, and so does the layouts file on load — so a hand-edited file and a click arrive
 * validated in exactly the same way. A malformed definition forgets the key rather than keeping a
 * half of one, and a key nextLinkedKey() would never have made is refused.
 *
 * @param {string} key - A linked column's key.
 * @param {*} [definition] - `{label, via, read}`, or nothing to forget the column.
 * @returns {void}
 */
export function setLinkedProperty(key, definition) {
    if (!KEY_PATTERN.test(key)) return;
    const read = readDefinition(definition);
    if (read) appState.linkedProperties.set(key, read);
    else appState.linkedProperties.delete(key);
}

/**
 * `linked:1`, or the first number after it not in use — nextLayoutName's scheme.
 * @returns {string}
 */
export function nextLinkedKey() {
    let n = 1;
    while (appState.linkedProperties.has(`${LINKED_KEY_PREFIX}${n}`)) n++;
    return `${LINKED_KEY_PREFIX}${n}`;
}

/**
 * Whether a heading is already some other column's, ignoring case — two columns headed "status"
 * cannot be told apart. Pure: the caller hands in the other columns' headings.
 *
 * @param {string} heading - The heading the dialog would give the column.
 * @param {string[]} otherHeadings - Every other column's heading.
 * @returns {boolean}
 */
export function headingInUse(heading, otherHeadings) {
    const lower = heading.trim().toLowerCase();
    return otherHeadings.some(other => String(other).trim().toLowerCase() === lower);
}
