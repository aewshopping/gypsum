import { CORE_FILE_PROPERTIES, FILE_PROPERTIES } from '../services/store.js';
import { VALUE_TYPES } from '../constants.js';
import { isLinkedKey, linkedProperty, linkedHeading } from '../services/linked-properties.js';
import { linkedValue } from '../services/internal-links/linked-value.js';
import { toYamlText, toYamlList } from '../services/file-parsing/yaml-value-write.js';

/**
 * @file What one note has to copy when a column is copied into a property, and the text that value
 * becomes. Pure — the files and the linked definition are handed in — so every kind of source is
 * tested in node. Asked by the copy itself and by its dialog's forecast, so the two cannot disagree
 * about which notes have something to copy. See plans/completed/table-copy-column.md §3.3 and §5.3.
 *
 * **Two kinds of source, because they are different things.** A front matter column is a key in the
 * note, so the note's own bytes are copied — that is copy-property.js's locate pass, and nothing here
 * turns it into text. A linked or core column is filled in by the app, so what its cell shows is the
 * source, and it is written out as text here.
 */

/**
 * The columns "copy column…" is not offered on: the file link, whose cell is an id nobody sees, the
 * issues, and the last modified date, which is stale the moment the copy writes the note. §5.1.
 */
const NOT_COPYABLE = ['internalId', 'fileIssues', 'lastModified'];

/**
 * Whether a column can be copied into the notes at all.
 * @param {string} source - The column's name.
 * @returns {boolean}
 */
export function isCopyableSource(source) {
    return !NOT_COPYABLE.includes(source);
}

/**
 * The copied column's heading, as its header shows it — what the dialog, the report line and the undo
 * list call it. The undo entry keeps it as it read at the time, so it still reads properly once a
 * linked column is renamed or deleted. §5.7.
 * @param {string} source - The column's name.
 * @returns {string}
 */
export function sourceHeading(source) {
    return linkedProperty(source) ? linkedHeading(source) : FILE_PROPERTIES.get(source)?.label ?? source;
}

/**
 * Whether this column's value comes from the note's own front matter, rather than being filled in by
 * the app (a core column) or worked out from other notes (a linked column).
 * @param {string} source - The column's name.
 * @returns {boolean}
 */
export function isFrontMatterSource(source) {
    return !isLinkedKey(source) && !CORE_FILE_PROPERTIES.includes(source);
}

/**
 * What one note has to copy, or undefined when it has nothing.
 *
 * - **A front matter column** gives whatever the note holds, a bare key's null included; only a note
 *   without the key has nothing.
 * - **A linked or core column** gives what its cell shows, as copyableValue says — nothing when the
 *   cell is empty.
 *
 * @param {string} source - The column's name.
 * @param {object} file - The note's file object.
 * @param {Map<string, object>} byId - filesById() of the loaded files, for a linked column.
 * @param {{via: string, read: string}|null} [linked] - The linked column's definition.
 * @returns {*} The value, or undefined.
 */
export function sourceValue(source, file, byId, linked = null) {
    if (isFrontMatterSource(source)) return Object.hasOwn(file, source) ? file[source] : undefined;
    const value = linked ? linkedValue(linked, file, byId) : file[source];
    return copyableValue(value) ?? undefined;
}

/**
 * A value an app-filled cell shows, as the string or list of strings a copy writes — or null when
 * the cell shows nothing. A Map is its keys, as `tags` is drawn. **A list keeps its empty slots**
 * when any slot holds something, because the n-th item still belongs to the n-th link. §5.4.
 *
 * @param {*} value
 * @returns {string|string[]|null}
 */
export function copyableValue(value) {
    const listed = value instanceof Map ? [...value.keys()] : value;
    if (Array.isArray(listed)) {
        const items = listed.map(item => (item === null || item === undefined ? '' : String(item)));
        return items.some(item => item !== '') ? items : null;
    }
    if (listed === null || listed === undefined || listed === '') return null;
    return String(listed);
}

/**
 * The text a linked or core value is written as: everything after the colon, in the shape the target
 * key already has. **A list stays a list and a single value a single value** — a list is written
 * from its items, never through a comma-joined line (§3.3).
 *
 * A given value in a given shape always gives the same text, which is what lets a re-copy of an
 * unchanged value be dropped as a no-op by plan-file-edits.js. §3.4.2.
 *
 * @param {string|string[]} value - From copyableValue.
 * @param {object} [shape] - What the note already looks like at the target key; see toYamlText.
 * @returns {string}
 */
export function copyText(value, shape = {}) {
    return Array.isArray(value)
        ? toYamlList(value, shape)
        : toYamlText(value, VALUE_TYPES.STRING.value, shape);
}

/**
 * Whether two values would read the same, for the dialog's "already match" count. Compared as text,
 * since that is what a cell draws: `42` and `"42"` match, a list never matches a single value, and a
 * bare key matches only a bare key. A forecast — the write compares bytes, so a value restyled by
 * hand is counted as matching here and rewritten there.
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
export function sameValue(a, b) {
    const norm = (value) => {
        const listed = value instanceof Map ? [...value.keys()] : value;
        if (Array.isArray(listed)) return JSON.stringify(listed.map(item => String(item ?? '')));
        return listed === null || listed === undefined ? null : JSON.stringify(String(listed));
    };
    return norm(a) === norm(b);
}
