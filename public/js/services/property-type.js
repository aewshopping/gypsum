import { isDateType, VALUE_TYPES, SEARCH_TYPES } from '../constants.js';
import { appState, FILE_PROPERTIES, TABLE_VIEW_COLUMNS, CORE_FILE_PROPERTIES } from './store.js';

/**
 * @file The one answer to "what type is this column, and how is it searched?".
 *
 * Both questions used to be a lookup in FILE_PROPERTIES, repeated in half a dozen places. They
 * stop being lookups the moment the user can set a type, because there are then two places an
 * answer can come from and an order they have to be consulted in. Six copies of that order would
 * be six chances to disagree, and a sort that disagreed with the cell it sorted would be very
 * hard to see.
 *
 * No page, no disk: it reads the user's chosen types and the schema, and returns a word. It also
 * holds the one writer for that choice, so nothing else has to know which type names are legal.
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
 * The type a property is treated as: what the user chose for it, then what the app's own schema
 * says, then text.
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
    // The app owns the type of every property it fills in itself, so a hand-edited file cannot
    // change one. Without this, `type: "number"` on lastModified would silently stop it sorting as
    // a date, and `type: "date"` on tags would break a column that is always a list.
    const chosen = isTypeSettable(name) ? appState.propertyTypes.get(name)?.type : undefined;
    if (isLegal(LEGAL_TYPES, chosen)) return chosen;

    const schema = FILE_PROPERTIES.get(name)?.type;
    if (isLegal(LEGAL_TYPES, schema)) return schema;

    return VALUE_TYPES.STRING.value;
}

/**
 * Whether the app fills this column in itself, rather than reading it from a note.
 *
 * It does not replace the column's type — `lastModified` is still a date and still sorts as one.
 * It decides one thing and no others: the glyph the column wears. Whether the type dialog is
 * offered is isTypeSettable(), which is the wider question and already covers every info column.
 *
 * @param {string} name - The file property key.
 * @returns {boolean}
 */
export function isInfoColumn(name) {
    return TABLE_VIEW_COLUMNS.info_columns.includes(name);
}

/**
 * Whether the user may choose this column's type — and so **whether it wears the padlock**.
 *
 * Two reasons they may not, and both are facts about the column rather than about one value:
 *
 * - **the app fills the column in** — the size, the last modified date, the load error
 * - **the property does not come from a note's front matter** — everything in CORE_FILE_PROPERTIES,
 *   which is `title`, `filename`, `filepath`, `tags`, `color`, `internalLink`, `internalLinkText`
 *   and the file-system columns. Their types are the app's: `tags` is always a list and
 *   `lastModified` is always a date, whatever a hand-edited layout file says.
 *
 * **Here rather than beside any one caller**, because four ask: type-glyph.js draws the padlock, the
 * column menu and the picker decide whether to offer the type dialog, the types modal decides which
 * properties to list, and propertyType() decides whether to read the user's choice at all. A padlock
 * over a column whose type you could still change would be a small lie told at scale.
 *
 * **This is no longer the same question as isPropertyEditable() below.** It was until `title` and
 * `color` became editable, and the padlock stayed with the type because that is what it is drawn on.
 *
 * @param {string} name - The file property key.
 * @returns {boolean}
 */
export function isTypeSettable(name) {
    return !isInfoColumn(name) && !CORE_FILE_PROPERTIES.includes(name);
}

/**
 * The properties the app fills in that a note may nonetheless override from its front matter — and
 * so the ones whose cells take a caret despite their padlock.
 *
 * **What they have in common is the spread in file-info.js.** Both are written into the file object
 * first, from the note's body, and then `...(yamlData)` puts front matter over the top. So the note
 * already has a place for a typed value, and it is exactly the place a cell edit splices: the value
 * lands at `title:` or `color:`, the re-read picks it up, and the cell shows what was typed.
 *
 * **Nothing else in CORE_FILE_PROPERTIES works that way.** `filename` and `filepath` are the file
 * itself and have their own writer in `editing/rename-file.js`. `tags` is deleted from `yamlData`
 * before the spread — it is merged into the TagMap instead — so front matter cannot override it and
 * a spliced value would not be what the table then drew. The rest are in RESERVED_KEYS, which
 * file-info.js strips outright.
 *
 * **Colour has a second writer, and front matter beats it.** The picker in the note editor writes a
 * `#color/…` body tag (`editing/color-pick-apply.js`), which a front matter `color:` silently
 * overrides — so a note coloured from the table has a picker that appears to do nothing. That was
 * already true of any note with `color:` in its front matter; the table only makes it easy to reach.
 * The way back is the way in: clearing the cell removes the key, and the body tag applies again.
 */
const WRITABLE_CORE_PROPERTIES = ['title', 'color'];

/**
 * Whether this column's cells can be typed into at all.
 *
 * A column whose type the user may set always can: it comes from front matter, which is exactly
 * where a cell edit splices. The question is only interesting for the ones the app fills in, and
 * the list above is those of them that say yes.
 *
 * Put a new exception in that list, never by taking a property out of CORE_FILE_PROPERTIES, which
 * has a second job registering properties when a folder holds no files.
 *
 * **Here rather than in cell-editor.js**, beside mismatchRefusesCaret(), so that one module owns
 * every answer to "why will this cell not take a caret".
 *
 * @param {string} name - The file property key.
 * @returns {boolean}
 */
export function isPropertyEditable(name) {
    return isTypeSettable(name) || WRITABLE_CORE_PROPERTIES.includes(name);
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
 *   date column. The column is fine and this one value is wrong — and the cell itself can fix it,
 *   because a scalar replacing a scalar splices exactly the bytes any other edit does. See
 *   mismatchRefusesCaret() below for which of the two turns a cell read-only.
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

    if (isDateType(type) && isNaN(new Date(value))) return 'unreadable';
    if (type === VALUE_TYPES.NUMBER.value && !readsAsNumber(value)) return 'unreadable';

    return null;
}

/**
 * Whether a mismatch is a reason to refuse a caret.
 *
 * Only 'shape' is. Committing a list into a column of single values — or the reverse — rewrites the
 * value in the other shape, so the `[ ]` or the block of `- ` lines the note was written with is
 * added or destroyed by something that looked like typing over a word. 'unreadable' is a scalar in
 * a scalar column: the same value span is spliced as for a value that fits, so `due: quite soon` is
 * corrected to `due: 2026-03-01` in place — which is the fix the cell used to send you to the note
 * to make by hand.
 *
 * Here rather than in cell-editor.js, beside isPropertyEditable() and the distinction it depends
 * on, because a caller that knew 'shape' was the dangerous one would be a second copy of what
 * typeMismatch() says above — and typeMismatch's own docblock already warns against working these
 * answers out anywhere else.
 *
 * @param {'shape'|'unreadable'|null|undefined} mismatch - What typeMismatch() said, or nothing.
 * @returns {boolean}
 */
export function mismatchRefusesCaret(mismatch) {
    return mismatch === 'shape';
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
    // Guarded the same way as the type above, and for the same reason: tags is searched by whole
    // items because the app says so, and a file on disk does not get to unpin that.
    const chosen = isTypeSettable(name) ? appState.propertyTypes.get(name)?.search_type : undefined;
    if (isLegal(LEGAL_SEARCH_TYPES, chosen)) return chosen;

    const schema = FILE_PROPERTIES.get(name)?.search_type;
    if (isLegal(LEGAL_SEARCH_TYPES, schema)) return schema;

    return SEARCH_TYPES.STRING.value;
}

/**
 * Records the user's chosen type for a property, or forgets it.
 *
 * The one way into appState.propertyTypes, so nothing else has to know which names are legal. Two
 * callers reach it from the type dialog — the column menu and the column picker — and the layouts
 * file reaches it through the same door on load, which is what makes a hand-edited file and a click
 * arrive validated in exactly the same way.
 *
 * **An illegal value is dropped rather than corrected.** Leaving the key absent falls the property
 * back to the schema, which is a better answer than text for every property the app knows about and
 * the same answer for the rest. Forgetting the entry entirely when neither value survives keeps
 * "absent means ask the schema" true, so the file never fills with empty objects.
 *
 * **A search type is only kept on a list.** Nothing else in the app searches by whole values, and
 * the dialog greys the choice off for every other type — so recording one there would write a
 * setting that says nothing into a file meant to be read. The type it is judged against is the one
 * being set, or the property's current answer when this call is not setting one, which is what lets
 * a hand-edited file name a search type without repeating a type the schema already gives.
 *
 * **A property the app fills in itself is refused outright.** Those types belong to the app, and
 * the same question — isTypeSettable — is what stops the dialog being offered for them in the
 * first place, so this is the boundary rather than a second opinion.
 *
 * @param {string} name - The file property key.
 * @param {*} type - The chosen value type, or anything else to leave it unset.
 * @param {*} searchType - The chosen search type, or anything else to leave it unset.
 * @returns {void}
 */
export function setPropertyType(name, type, searchType) {
    if (!isTypeSettable(name)) return;

    const isList = (isLegal(LEGAL_TYPES, type) ? type : propertyType(name)) === VALUE_TYPES.ARRAY.value;

    const entry = {
        ...(isLegal(LEGAL_TYPES, type) && { type }),
        ...(isList && isLegal(LEGAL_SEARCH_TYPES, searchType) && { search_type: searchType }),
    };

    if (Object.keys(entry).length) appState.propertyTypes.set(name, entry);
    else appState.propertyTypes.delete(name);
}
