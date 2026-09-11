/**
 * @file Converts between the table's in-memory layout and the array a layout file holds.
 *
 * No File System API, no DOM — just the two directions of the same fact, kept in one place so
 * they cannot drift apart. layout-file.js does the reading and writing around it.
 */

import { TABLE_VIEW_COLUMNS, defaultColumnEntry } from '../services/store.js';
import { VALUE_TYPES, SEARCH_TYPES } from '../constants.js';

const LEGAL_TYPES = new Set(Object.values(VALUE_TYPES).map(entry => entry.value));
const LEGAL_SEARCH_TYPES = new Set(Object.values(SEARCH_TYPES).map(entry => entry.value));

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
 * - **A type this app has never heard of is dropped rather than kept.** It is left absent instead
 *   of corrected to text, so the property falls back to whatever the schema says about it — which
 *   is a better answer than text for every property the app knows, and the same answer for the
 *   rest.
 * - **A column is shown only if it says `visible: true`.** A layout is a closed statement of which
 *   columns its user wants, so anything else — `false`, a string, or no flag at all — leaves the
 *   column hidden. That is the same answer resolveColumns() gives a property the layout does not
 *   mention, so a hand-edited file cannot get a column shown by saying less than a saved one does.
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
            ...(LEGAL_TYPES.has(column.type) && { type: column.type }),
            ...(LEGAL_SEARCH_TYPES.has(column.search_type) && { search_type: column.search_type }),
        });
    }
}
