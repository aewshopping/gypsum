/**
 * @file Converts between what the layouts file holds and what the app holds in memory: the columns
 * array, the propertyTypes object, the flowchart object and the linkedProperties object — and the
 * pure document changes that adding or deleting a linked column makes.
 *
 * No File System API, no DOM — just the two directions of each fact, kept in one place so they
 * cannot drift apart. layout-file.js does the reading and writing around it.
 *
 * Three facts rather than one, because they belong to different things. A column entry says how
 * this arrangement draws a property; a propertyTypes entry says what the property is; a flowchart
 * entry says which property a part of the chart reads. That is why a type is not on the column any
 * more — see plans/completed/table-value-types.md and the plan that undid its §3.1 — and why the
 * flowchart's choices are not inside a layout either: there is one chart, not one per arrangement
 * of columns.
 */

import { appState, TABLE_VIEW_COLUMNS, defaultColumnEntry } from '../services/store.js';
import { setPropertyType } from '../services/property-type.js';
import { setFlowchartOption } from '../services/flowchart-options.js';
import { setLinkedProperty } from '../services/linked-properties.js';

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
 * How many columns stick left, as a layout in the file asks for it.
 *
 * Hand-editable like the rest of a layout, so anything but a whole number from 0 up is read as 0 —
 * a count too large for the columns shown is fine, since the renderer stops at the last column.
 *
 * @param {*} raw - The layout's `stickyColumns` value, or anything at all.
 * @returns {void}
 */
export function applyStickyCountFromLayout(raw) {
    TABLE_VIEW_COLUMNS.stickyCount = Number.isInteger(raw) && raw > 0 ? raw : 0;
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

/**
 * The flowchart's chosen properties as the object a file holds: one entry per role.
 *
 * Only roles someone has pointed somewhere appear, for propertyTypesFromState's reason — an absent
 * role is the answer "use the default", so writing all five out every time would turn one choice
 * into a block of settings that say nothing.
 *
 * @returns {Object<string, string>}
 */
export function flowchartOptionsFromState() {
    return Object.fromEntries(appState.flowchartOptions);
}

/**
 * Fills appState.flowchartOptions from a file's flowchart object, replacing whatever was there.
 *
 * Every entry goes through setFlowchartOption, so a hand-edited file and a change in the options
 * dialog are validated by the same function: a role name FLOWCHART_ROLES does not carry is dropped
 * rather than corrected.
 *
 * The clear is what both folder loaders rely on — neither has to know this state exists, the same
 * way neither clears propertyTypes for itself once applyActiveLayout has run.
 *
 * @param {*} raw - The `flowchart` object as parsed from the file, or anything at all.
 * @returns {void}
 */
export function applyFlowchartOptionsFromFile(raw) {
    appState.flowchartOptions.clear();
    if (!raw || typeof raw !== 'object') return;

    for (const [role, property] of Object.entries(raw)) {
        setFlowchartOption(role, property);
    }
}

/**
 * The linked columns as the object a file holds, keyed by `linked:<n>`.
 * @returns {Object<string, {label: string|null, via: string, read: string}>}
 */
export function linkedPropertiesFromState() {
    return Object.fromEntries(appState.linkedProperties);
}

/**
 * Fills appState.linkedProperties from a file's linkedProperties object, replacing whatever was
 * there. Every entry goes through setLinkedProperty, so a malformed hand-edited definition is
 * dropped exactly as a bad dialog save would be.
 *
 * @param {*} raw - The `linkedProperties` object as parsed from the file, or anything at all.
 * @returns {void}
 */
export function applyLinkedPropertiesFromFile(raw) {
    appState.linkedProperties.clear();
    if (!raw || typeof raw !== 'object') return;

    for (const [key, definition] of Object.entries(raw)) {
        setLinkedProperty(key, definition);
    }
}

/**
 * The layouts document with a new linked column in it: its definition stored, and — when a layout
 * is active — **one visible entry appended to that layout's stored columns, and nothing else
 * changed.** plans/completed/table-linked-properties.md §3.1.
 *
 * Appended to what the file holds rather than saved from the screen, because the screen may carry a
 * reorder or a resize waiting to be saved, and adding a column must not make those look saved. Only
 * the active layout gets it: the others meet it hidden, the way they meet any column they have not
 * chosen. Pure, so the rule is tested in node.
 *
 * @param {object} doc - The layouts document, as readLayouts returns it.
 * @param {string} key - The new column's key.
 * @param {{label: string|null, via: string, read: string}} definition
 * @returns {object} A new document; `doc` is untouched.
 */
export function withLinkedColumn(doc, key, definition) {
    const next = { ...doc, linkedProperties: { ...doc.linkedProperties, [key]: definition } };

    const layout = doc.active ? doc.layouts?.[doc.active] : null;
    if (!layout || !Array.isArray(layout.columns) || layout.columns.some(column => column?.name === key)) {
        return next;
    }

    const orders = layout.columns.map(column => column?.order).filter(Number.isFinite);
    const order = orders.length > 0 ? Math.max(...orders) + 1 : layout.columns.length;
    const entry = { order, name: key, ...defaultColumnEntry(key), visible: true };
    next.layouts = { ...doc.layouts, [doc.active]: { ...layout, columns: [...layout.columns, entry] } };
    return next;
}

/**
 * The layouts document without a linked column: its definition gone, and its entry taken out of
 * **every** layout, so no layout goes on naming a column that no longer exists. Pure.
 *
 * @param {object} doc - The layouts document, as readLayouts returns it.
 * @param {string} key - The column's key.
 * @returns {object} A new document; `doc` is untouched.
 */
export function withoutLinkedColumn(doc, key) {
    const linkedProperties = { ...doc.linkedProperties };
    delete linkedProperties[key];

    const layouts = Object.fromEntries(Object.entries(doc.layouts ?? {}).map(([name, layout]) => [
        name,
        Array.isArray(layout?.columns)
            ? { ...layout, columns: layout.columns.filter(column => column?.name !== key) }
            : layout,
    ]));
    return { ...doc, linkedProperties, layouts };
}

/**
 * One layout's columns after property `from` has been renamed `to` in the notes: the file's array
 * and the columns in memory both go through here, so the two cannot disagree about what a rename did
 * to a layout. plans/completed/table-rename-column.md §10.1.
 *
 * - **`from` gone from every note**: its entry becomes `to`'s in place — position, width, visibility —
 *   and a `to` entry already in the layout is dropped. Going forward that is a keyless column left
 *   over, since no note had `to`; on an undo it can be the column of notes the rename skipped, and
 *   the outcome is still the one wanted: one column, where the user was looking.
 * - **`from` still in some note**: a `to` entry goes in straight after `from`'s, with its width and
 *   visibility, so the renamed notes appear beside the ones left behind rather than hidden at the
 *   end. A layout that already has `to` is left as it is.
 * - **A label follows only if it was `from`'s default**; one written by hand is kept.
 * - **The same columns stay stuck.** The sticky count is of leading shown columns, so a shown column
 *   dropped or inserted inside that run moves the count with it.
 *
 * Nothing is renumbered: the array comes back in resolved order with each entry's own `order`, and
 * an inserted entry copies `from`'s and sits straight after it, which resolveOrder's index tiebreak
 * keeps in place.
 *
 * @param {Array<object>} columns - A layout's columns: the file's array, or memory's entries with
 *   their names.
 * @param {number} stickyCount - How many leading shown columns stick.
 * @param {string} from
 * @param {string} to
 * @param {boolean} fromGone - Whether no loaded note will carry `from` once this rename is counted.
 * @returns {{columns: Array<object>, stickyCount: number}}
 */
export function renameInColumns(columns, stickyCount, from, to, fromGone) {
    const ordered = resolveOrder(columns);
    const at = ordered.findIndex(column => column?.name === from);
    const toAt = ordered.findIndex(column => column?.name === to);
    if (at === -1 || (!fromGone && toAt !== -1)) return { columns, stickyCount };

    const shown = (column) => column.visible === true || TABLE_VIEW_COLUMNS.shown_always.includes(column.name);
    const isStuck = (index) => shown(ordered[index])
        && ordered.slice(0, index).filter(shown).length < stickyCount;

    const source = ordered[at];
    const renamed = {
        ...source,
        name: to,
        ...(source.label === defaultColumnEntry(from).label && { label: defaultColumnEntry(to).label }),
    };

    if (fromGone) {
        return {
            columns: ordered.map((column, index) => index === at ? renamed : column)
                .filter((_, index) => index !== toAt),
            stickyCount: toAt !== -1 && isStuck(toAt) ? stickyCount - 1 : stickyCount,
        };
    }
    return {
        columns: [...ordered.slice(0, at + 1), renamed, ...ordered.slice(at + 1)],
        stickyCount: isStuck(at) ? stickyCount + 1 : stickyCount,
    };
}
