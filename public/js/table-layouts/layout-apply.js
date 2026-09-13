/**
 * @file Converts between what the layouts file holds and what the app holds in memory: the columns
 * array on one side, and the propertyTypes object on the other.
 *
 * No File System API, no DOM — just the two directions of each fact, kept in one place so they
 * cannot drift apart. layout-file.js does the reading and writing around it.
 *
 * Two facts rather than one, because they belong to different things. A column entry says how this
 * arrangement draws a property; a propertyTypes entry says what the property is. That is why a type
 * is not on the column any more — see plans/completed/table-value-types.md and the plan that undid
 * its §3.1.
 */

import { appState, TABLE_VIEW_COLUMNS, defaultColumnEntry } from '../services/store.js';
import { setPropertyType } from '../services/property-type.js';

/**
 * The current layout as the array a file holds: one object per column, carrying its position.
 *
 * `order` is regenerated from the Map's key order every time this runs, so it cannot drift out
 * of step with the order actually on screen — nothing tracks it while columns are being dragged
 * about, because nothing needs to.
 *
 * @returns {Array<{order: number, name: string, label: string, width: number, visible: boolean}>}
 */
export function layoutFromColumnLayout() {
    return [...TABLE_VIEW_COLUMNS.columnLayout]
        .map(([name, entry], order) => ({ order, name, ...entry }));
}

/**
 * Sorts a file's columns into the order it asks for.
 *
 * Only relative values matter and nothing is renumbered, which is what makes gaps, fractions and
 * negatives all work: `0.5` drops a column between the first two, `-1` sends one to the front.
 *
 * An order that is not a finite number is treated as absent and sorts to the end. The coercion
 * happens here rather than inside the comparator because a comparator that returns NaN does not
 * sort badly, it sorts arbitrarily — one bad value could scramble the whole list.
 *
 * The index tiebreak makes the sort stable explicitly rather than relying on the engine, so
 * repeated and absent orders keep the sequence the file wrote them in.
 *
 * @param {Array<object>} columns - The `columns` array as parsed from the file.
 * @returns {Array<object>} The same objects, in the order the file asks for.
 */
function resolveOrder(columns) {
    return columns
        .map((column, index) => ({
            column,
            order: Number.isFinite(column?.order) ? column.order : Infinity,
            index,
        }))
        .sort((a, b) => (a.order - b.order) || (a.index - b.index))
        .map(({ column }) => column);
}

/**
 * Fills columnLayout from a file's columns array, replacing whatever was there.
 *
 * Three things are resolved rather than trusted, because a layout file is a genuine boundary —
 * it is meant to be hand-edited, so it arrives however the user left it:
 *
 * - **`hidden_always` is dropped.** Those are hard exclusions, not defaults: a
 *   FileSystemFileHandle cannot be rendered, so a layout naming one is ignored rather than
 *   honoured.
 * - **A repeated name keeps its first appearance in sorted order.** Left to the Map, the first
 *   insertion would fix the column's position while the last overwrote its values, so a
 *   duplicate would silently take one entry's place and another's width.
 * - **An unusable label or width falls back to the schema's.** A width of `"wide"` in a grid
 *   track is a broken table rather than an error, so it never gets that far.
 * - **A column is shown only if it says `visible: true`.** A layout is a closed statement of which
 *   columns its user wants, so anything else — `false`, a string, or no flag at all — leaves the
 *   column hidden. That is the same answer resolveColumns() gives a property the layout does not
 *   mention, so a hand-edited file cannot get a column shown by saying less than a saved one does.
 *
 * A `type` or `search_type` left on a column by an older file is not one of them: it is simply not
 * read, so it falls through the whitelist this builds. Those belong to the property now, and the
 * pair below is where they are read from.
 *
 * @param {Array<object>} columns - The `columns` array as parsed from the file.
 * @returns {void}
 */
export function applyLayoutToColumnLayout(columns) {
    const { columnLayout, hidden_always } = TABLE_VIEW_COLUMNS;
    columnLayout.clear();

    for (const column of resolveOrder(columns)) {
        const name = column?.name;
        if (typeof name !== 'string' || hidden_always.includes(name) || columnLayout.has(name)) continue;

        const fallback = defaultColumnEntry(name);
        columnLayout.set(name, {
            label: typeof column.label === 'string' ? column.label : fallback.label,
            width: Number.isFinite(column.width) ? column.width : fallback.width,
            visible: column.visible === true,
        });
    }
}

/**
 * The chosen types as the object a file holds: one entry per property, keyed by its name.
 *
 * Only properties someone has typed appear. An absent key is the answer "ask the schema", so
 * writing every property out with its resolved type would turn a handful of choices into a wall of
 * defaults — which is exactly what storing the type on every column of every layout used to do.
 *
 * @returns {Object<string, {type?: string, search_type?: string}>}
 */
export function propertyTypesFromState() {
    return Object.fromEntries(appState.propertyTypes);
}

/**
 * Fills appState.propertyTypes from a file's propertyTypes object, replacing whatever was there.
 *
 * Every entry goes through setPropertyType, so a hand-edited file and a click on the type dialog
 * are validated by the same function: an unknown type name is dropped rather than corrected, and a
 * property the app fills in itself is refused however the file asks.
 *
 * @param {*} raw - The `propertyTypes` object as parsed from the file, or anything at all.
 * @returns {void}
 */
export function applyPropertyTypesFromFile(raw) {
    appState.propertyTypes.clear();
    if (!raw || typeof raw !== 'object') return;

    for (const [name, entry] of Object.entries(raw)) {
        setPropertyType(name, entry?.type, entry?.search_type);
    }
}
