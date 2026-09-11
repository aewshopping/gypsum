import { VALUE_TYPES, SEARCH_TYPES } from '../constants.js';
import { FILE_PROPERTIES, TABLE_VIEW_COLUMNS } from './store.js';

/**
 * @file The one answer to "what type is this column, and how is it searched?".
 *
 * Both questions used to be a lookup in FILE_PROPERTIES, repeated in half a dozen places. They
 * stop being lookups the moment the user can set a type, because there are then two places an
 * answer can come from and an order they have to be consulted in. Six copies of that order would
 * be six chances to disagree, and a sort that disagreed with the cell it sorted would be very
 * hard to see.
 *
 * No page, no disk, no state of its own: it reads the layout and the schema and returns a word.
 */

const LEGAL_TYPES = new Set(Object.values(VALUE_TYPES).map(entry => entry.value));
const LEGAL_SEARCH_TYPES = new Set(Object.values(SEARCH_TYPES).map(entry => entry.value));

/**
 * @param {Set<string>} legal
 * @param {*} value
 * @returns {boolean}
 */
function isLegal(legal, value) {
    return typeof value === 'string' && legal.has(value);
}

/**
 * The type a property is treated as: what the user chose for that column, then what the app's
 * own schema says, then text.
 *
 * Text is the floor rather than "no type", so every caller gets a word it can switch on and none
 * of them needs a fallback of its own. An illegal value is ignored at each level rather than
 * passed on, because a hand-edited layout file is a genuine boundary.
 *
 * Nothing here looks at the values in the files. A column that changed type by itself when a note
 * was added would be worse than one that is occasionally wrong.
 *
 * @param {string} name - The file property key.
 * @returns {string} One of VALUE_TYPES' values.
 */
export function propertyType(name) {
    // The app owns an info column's type, so a layout file cannot change it. Without this, a
    // hand-edited layout saying `type: "number"` on lastModified would silently stop it sorting as
    // a date — and a layout file is a genuine boundary everywhere else in this feature.
    const chosen = isInfoColumn(name) ? undefined : TABLE_VIEW_COLUMNS.columnLayout.get(name)?.type;
    if (isLegal(LEGAL_TYPES, chosen)) return chosen;

    const schema = FILE_PROPERTIES.get(name)?.type;
    if (isLegal(LEGAL_TYPES, schema)) return schema;

    return VALUE_TYPES.STRING.value;
}

/**
 * Whether the app fills this column in itself, rather than reading it from a note.
 *
 * It does not replace the column's type — `lastModified` is still a date and still sorts as one.
 * It decides three things and no others: the glyph the column wears, that the type dialog is not
 * offered, and that its cells take no caret.
 *
 * @param {string} name - The file property key.
 * @returns {boolean}
 */
export function isInfoColumn(name) {
    return TABLE_VIEW_COLUMNS.info_columns.includes(name);
}

/**
 * Why a value cannot be shown as the type its column is set to, or null when it can.
 *
 * Two different things go wrong, and they have different fixes, so they are told apart rather than
 * lumped together:
 *
 * - **'shape'** — a list in a column of single values, or a single value in a column of lists. The
 *   note is fine and the column's type is wrong; changing it back fixes every cell at once.
 * - **'unreadable'** — the right shape, but the text cannot be read as the type. "quite soon" in a
 *   date column. The column is fine and the note is wrong, so only opening the note fixes it.
 *
 * The question a renderer asks before drawing a cell, and the one the editing work asks before
 * deciding what a click on that cell does. Both must ask here rather than reading what ended up on
 * screen: a mismatched cell shows its text, and text is what a matching one shows too.
 *
 * Nothing is missing: a blank cell is blank whatever the column is set to. And text can hold
 * anything, so a text column is never unreadable.
 *
 * @param {*} value - The value on the file object.
 * @param {string} type - One of VALUE_TYPES' values.
 * @returns {'shape'|'unreadable'|null}
 */
export function typeMismatch(value, type) {
    if (value === null || value === undefined || value === '') return null;

    const isList = value instanceof Map || Array.isArray(value);
    if (isList !== (type === VALUE_TYPES.ARRAY.value)) return 'shape';

    if (type === VALUE_TYPES.DATE.value && isNaN(new Date(value))) return 'unreadable';
    if (type === VALUE_TYPES.NUMBER.value && !readsAsNumber(value)) return 'unreadable';

    return null;
}

/**
 * Whether a value is a number, or text that is one. A boolean is neither: Number(true) is 1, which
 * would quietly pass `published: true` off as the number one.
 * @param {*} value
 * @returns {boolean}
 */
function readsAsNumber(value) {
    if (typeof value === 'number') return !isNaN(value);
    return typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value));
}

/**
 * How a property is searched: what the user chose, then what the schema says, then contains.
 *
 * It does not fall back to the property's type, which is the whole point of it being a separate
 * question — a list column is searched by part of its text unless something explicitly asks for
 * whole items. `tags` is what asks, because clicking the tag "cat" must not also bring back
 * everything tagged "category".
 *
 * @param {string} name - The file property key.
 * @returns {string} One of SEARCH_TYPES' values.
 */
export function propertySearchType(name) {
    const chosen = TABLE_VIEW_COLUMNS.columnLayout.get(name)?.search_type;
    if (isLegal(LEGAL_SEARCH_TYPES, chosen)) return chosen;

    const schema = FILE_PROPERTIES.get(name)?.search_type;
    if (isLegal(LEGAL_SEARCH_TYPES, schema)) return schema;

    return SEARCH_TYPES.STRING.value;
}
