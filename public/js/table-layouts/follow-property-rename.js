import { appState, TABLE_VIEW_COLUMNS } from '../services/store.js';
import { setPropertyType, propertyType, propertySearchType } from '../services/property-type.js';
import { setFlowchartOption } from '../services/flowchart-options.js';
import { setLinkedProperty } from '../services/linked-properties.js';
import { renameInColumns } from './layout-apply.js';
import { renamePropertyInLayouts } from './layout-file.js';

/**
 * @file What follows a property's name outside the notes when it is renamed in them: the columns,
 * the type, the flowchart's roles, the linked columns and the sort. Without it a rename would leave the layout asking for
 * `people` — a faded, empty column where the user was looking — and `attendees` appended hidden at
 * the end. Here rather than beside the rename because what it changes is what table-layouts/ owns:
 * the layouts, and the types and flowchart choices kept in the same file. plans/completed/table-rename-column.md §10.
 *
 * **Nothing here writes a note, and nothing here is on the undo stack.** Undo restores files; the
 * name follows the files because this runs again with the names swapped after an undo, not because
 * what it did was recorded.
 */

/**
 * Follows a rename that has just been written, **deciding from what the folder will hold rather than
 * from what the batch hoped to do** — so a partial rename, a partial undo and a note that gained the
 * new name mid-write all come out right with no case of their own. Called by the rename, and by undo
 * and redo of one with the names swapped.
 *
 * Runs inside applyRawEdits' `beforeRefresh`, after the notes are written and before the one render,
 * which is why `from` being gone is asked of the records: the file objects are not yet re-read. What
 * the screen reads is changed here and now; the layouts file is queued and not waited for — the
 * caller waits for the promise once the write pass is over. §10.1.
 *
 * **It never throws.** `beforeRefresh` runs inside applyRawEdits' `finally`, just before the refresh:
 * a throw there would skip the refresh — the notes renamed on disk and the table still showing the
 * old rows — and reach the caller as a rename that stopped, when it had finished. So a throw is
 * logged and becomes a layout that was not saved, which the result line reports. Nothing it could
 * leave half-done writes a note, and the layouts file is only queued once the rest has run.
 *
 * @param {string} from - The name the notes are leaving.
 * @param {string} to - The name they now carry.
 * @param {Array<object>} records - What the write applied. In a rename batch every record for `from`
 *   is that key's removal, in either direction.
 * @returns {Promise<boolean>} Whether the layouts file took the new name.
 */
export function followPropertyRename(from, to, records) {
    try {
        const removedFrom = new Set(records.filter(record => record.property === from).map(record => record.internalId));
        return follow(from, to, removedFrom).then(written => written === true);
    } catch (err) {
        console.warn(`Following the rename of ${from} to ${to} failed:`, err);
        return Promise.resolve(false);
    }
}

/**
 * - **Columns**, in memory and in every saved layout: renameInColumns.
 * - **The type is copied, never moved**: `to` is read as `from` is read — `from`'s saved type, or
 *   failing that the schema's, since `people` is a list by the app's own schema and `attendees` has
 *   none — and `from` keeps its own. It is saved only where it differs from what `to` would be read
 *   as anyway, so a rename leaves no type behind that says nothing. On an undo the copy runs the
 *   other way, which is what keeps a type set on the new name since: undoing the rename puts the
 *   notes back, not a type change made after it.
 * - **The flowchart's roles, the linked columns and the sort** follow only once no note carries
 *   `from`, since some notes still carrying it means its column still has something to show. A
 *   linked column named after its choices is renamed with them for free — its heading is worked out
 *   when drawn. plans/completed/table-linked-properties.md §3.9.
 *
 * @param {string} from
 * @param {string} to
 * @param {Set<string>} removedFrom - The notes whose records took `from` out in this batch.
 * @returns {Promise<boolean|undefined>} See renamePropertyInLayouts.
 */
function follow(from, to, removedFrom) {
    const fromGone = appState.myFiles.every(file =>
        !Object.hasOwn(file, from) || removedFrom.has(file.internalId));

    const { columnLayout } = TABLE_VIEW_COLUMNS;
    const inMemory = renameInColumns([...columnLayout].map(([name, entry]) => ({ name, ...entry })),
        TABLE_VIEW_COLUMNS.stickyCount, from, to, fromGone);
    columnLayout.clear();
    for (const { name, ...entry } of inMemory.columns) columnLayout.set(name, entry);
    TABLE_VIEW_COLUMNS.stickyCount = inMemory.stickyCount;

    const type = propertyType(from);
    const searchType = propertySearchType(from);
    setPropertyType(to);   // forgotten first, so what `to` resolves to next is its own default
    setPropertyType(to,
        type !== propertyType(to) ? type : undefined,
        searchType !== propertySearchType(to) ? searchType : undefined);

    if (fromGone) {
        for (const [role, property] of [...appState.flowchartOptions]) {
            if (property === from) setFlowchartOption(role, to);
        }
        for (const [key, definition] of [...appState.linkedProperties]) {
            if (definition.via !== from && definition.read !== from && definition.copyTo !== from) continue;
            setLinkedProperty(key, {
                ...definition,
                via: definition.via === from ? to : definition.via,
                read: definition.read === from ? to : definition.read,
                copyTo: definition.copyTo === from ? to : definition.copyTo,
            });
        }
        if (appState.sortState.property === from) appState.sortState.property = to;
    }

    return renamePropertyInLayouts(from, to, fromGone);
}
