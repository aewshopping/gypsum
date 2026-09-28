import { VALUE_TYPES } from '../constants.js';
import { setPropertyType, propertyType, propertySearchType } from '../services/property-type.js';
import { setLinkedProperty } from '../services/linked-properties.js';
import { showCopiedColumn } from './layout-file.js';

/**
 * @file What follows a copy outside the notes: the target's type, its column, and where a linked
 * column was last copied to. The copy's counterpart to follow-property-rename.js, and here for the
 * same reason — what it changes is what table-layouts/ owns. See plans/completed/table-copy-column.md §4.3.
 *
 * **Nothing here writes a note, and nothing here is on the undo stack.** Undo takes back the notes
 * and nothing else: the column stays, faded if nothing now holds a value, and the type stays set —
 * as removing a column or deleting its values never forgets a type either.
 */

/**
 * Follows a copy that has just been written. Runs inside applyRawEdits' `beforeRefresh`, so the one
 * render draws the column with its new type; the layouts file is queued, and the caller waits for the
 * promise once the write pass is over.
 *
 * **It never throws**, for followPropertyRename's reason: a throw in `beforeRefresh` would skip the
 * refresh and report a finished copy as stopped. A throw is logged and becomes a layout that was not
 * saved, which the result line reports.
 *
 * @param {string} source - The column copied.
 * @param {string} target - The property copied into.
 * @param {Array<object>} records - What the write applied. Nothing follows a copy that wrote nothing.
 * @param {{label: string|null, via: string, read: string}|null} linked - The linked column's
 *   definition, when the source is one.
 * @returns {Promise<boolean>} Whether the layouts file took the column, type and pre-fill.
 */
export function followPropertyCopy(source, target, records, linked) {
    if (records.length === 0) return Promise.resolve(true);
    try {
        follow(source, target, linked);
        return showCopiedColumn(target).then(written => written === true);
    } catch (err) {
        console.warn(`Following the copy of ${source} to ${target} failed:`, err);
        return Promise.resolve(false);
    }
}

/**
 * - **The type is the source's, overwriting the target's own** — the user is copying for a reason,
 *   and the target should read like its source. A linked column's own type is not one a property can
 *   have, so it is a list when its links do (one slot per link), and otherwise what it reads. It is
 *   saved only where it differs from what the target would be read as anyway, as a rename saves it,
 *   so a copy leaves no type behind that says nothing. `title` and `color` keep the app's type:
 *   setPropertyType refuses them.
 * - **A linked column remembers the target**, as the copy dialog's next pre-fill. §5.5.
 *
 * @param {string} source
 * @param {string} target
 * @param {{via: string, read: string}|null} linked
 * @returns {void}
 */
function follow(source, target, linked) {
    const listed = linked && propertyType(linked.via) === VALUE_TYPES.ARRAY.value;
    const type = linked ? (listed ? VALUE_TYPES.ARRAY.value : propertyType(linked.read)) : propertyType(source);
    const searchType = linked ? undefined : propertySearchType(source);

    setPropertyType(target);   // forgotten first, so what the target resolves to next is its own default
    setPropertyType(target,
        type !== propertyType(target) ? type : undefined,
        searchType !== undefined && searchType !== propertySearchType(target) ? searchType : undefined);

    if (linked) setLinkedProperty(source, { ...linked, copyTo: target });
}
