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
    const chosen = TABLE_VIEW_COLUMNS.columnLayout.get(name)?.type;
    if (isLegal(LEGAL_TYPES, chosen)) return chosen;

    const schema = FILE_PROPERTIES.get(name)?.type;
    if (isLegal(LEGAL_TYPES, schema)) return schema;

    return VALUE_TYPES.STRING.value;
}

/**
 * How a property is searched: what the user chose, then what the schema says, then contains text.
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
