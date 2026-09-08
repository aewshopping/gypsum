/**
 * @file Reads and writes .gypsum/table_layouts.gypsum — every saved layout for the folder, and
 * which one is in use.
 *
 * One file rather than one per layout: a layout's name is a JSON key, so nothing has to be
 * sanitised into a filename, renaming is a key change rather than the write-then-delete the File
 * System API forces, and the active name is written in the same breath as the layouts it points
 * at, so it cannot come to name one that is gone. The same arrangement history.gypsum has.
 *
 * Every call is wrapped and a failure is swallowed, as in local-backup.js: nothing about the
 * table should break because a layout could not be read or written.
 */

import { appState, TABLE_VIEW_COLUMNS } from '../services/store.js';
import { SAVE_FOLDER, LAYOUTS_FILENAME } from '../constants.js';
import { layoutFromColumnLayout, applyLayoutToColumnLayout } from './layout-apply.js';

const LAYOUT_VERSION = 1;

/**
 * Writes run one at a time, in the order they were asked for.
 *
 * Saving is fire-and-forget — the render never waits on the disk — so without this a drag, an
 * auto-size and a picker close in quick succession could have three writables open on the same
 * file at once and interleave into truncated JSON.
 */
let _queue = Promise.resolve();

/**
 * @param {Function} task - An async function to run once the writes before it have finished.
 * @returns {Promise<void>}
 */
function enqueue(task) {
    _queue = _queue.then(task).catch(() => {});
    return _queue;
}

/**
 * No layouts, and the app's built-in defaults in use.
 * @returns {{layoutVersion: number, active: string|null, layouts: object}}
 */
function emptyDocument() {
    return { layoutVersion: LAYOUT_VERSION, active: null, layouts: {} };
}

/**
 * Reads and parses the layouts file.
 *
 * Returns an empty document for every failure — no directory handle, no .gypsum folder, no file,
 * unparseable JSON — so no caller has to tell "this folder has no layouts" apart from "the
 * layouts could not be read". The distinction would not change what any of them do.
 *
 * @async
 * @returns {Promise<{layoutVersion: number, active: string|null, layouts: object}>}
 */
export async function readLayouts() {
    if (!appState.dirHandle) return emptyDocument();
    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER, { create: false });
        const fileHandle = await gypsumDir.getFileHandle(LAYOUTS_FILENAME, { create: false });
        const parsed = JSON.parse(await (await fileHandle.getFile()).text());
        return {
            layoutVersion: parsed.layoutVersion ?? LAYOUT_VERSION,
            active: typeof parsed.active === 'string' ? parsed.active : null,
            layouts: (parsed.layouts && typeof parsed.layouts === 'object') ? parsed.layouts : {},
        };
    } catch {
        return emptyDocument();
    }
}

/**
 * Serialises the document and writes it.
 *
 * Pretty-printed, unlike history.gypsum: this file is small, and hand-editing it is a supported
 * way to reorder columns, which a single line of JSON would not be.
 *
 * @async
 * @param {object} doc
 * @returns {Promise<boolean>} true when the file was written.
 */
async function writeLayouts(doc) {
    if (!appState.dirHandle) return false;
    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER, { create: true });
        const fileHandle = await gypsumDir.getFileHandle(LAYOUTS_FILENAME, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(doc, null, 2));
        await writable.close();
        return true;
    } catch {
        return false;
    }
}

/**
 * Republishes the document's names and active layout into appState, which is what the control row
 * renders from. An active name with no layout behind it falls back to the app defaults.
 * @param {object} doc
 * @returns {void}
 */
function refreshState(doc) {
    appState.tableLayouts = {
        names: Object.keys(doc.layouts),
        active: (doc.active && doc.layouts[doc.active]) ? doc.active : null,
    };
}

/**
 * Loads the active layout into columnLayout, and the layout list into appState.
 *
 * Called by both folder loaders once a directory handle is in place. When there is no file, or
 * the active layout is the app's defaults, columnLayout is left empty and resolveColumns() seeds
 * the defaults on the next render exactly as it always has — an empty Map already means
 * "use the defaults", so a folder that has never saved a layout needs no special case.
 *
 * @async
 * @returns {Promise<void>}
 */
export async function applyActiveLayout() {
    const doc = await readLayouts();
    refreshState(doc);
    const { active } = appState.tableLayouts;
    if (active) applyLayoutToColumnLayout(doc.layouts[active].columns ?? []);
}

/**
 * Writes the columns as they are on screen to the named layout, and makes it active.
 *
 * The one write both menu items go through: "save layout" passes the active layout's name and
 * "save as new" passes a name the user typed. Saving is always something the user asked for, so
 * there is nothing here that watches for changes and nothing that creates a layout on its own.
 *
 * @async
 * @param {string} name
 * @returns {Promise<void>}
 */
export function saveLayout(name) {
    const columns = layoutFromColumnLayout();
    return enqueue(async () => {
        const doc = await readLayouts();
        doc.layouts[name] = { updated: new Date().toISOString(), columns };
        doc.active = name;
        await writeLayouts(doc);
        refreshState(doc);
    });
}

/**
 * Renames a layout, and follows it with the active pointer if it was the one in use.
 *
 * The object is rebuilt rather than having a key added and another deleted, so the renamed layout
 * keeps its place in the menu instead of jumping to the end.
 *
 * @async
 * @param {string} from
 * @param {string} to
 * @returns {Promise<void>}
 */
export function renameLayout(from, to) {
    return enqueue(async () => {
        const doc = await readLayouts();
        if (!doc.layouts[from]) return;

        doc.layouts = Object.fromEntries(
            Object.entries(doc.layouts).map(([key, value]) => [key === from ? to : key, value])
        );
        if (doc.active === from) doc.active = to;
        await writeLayouts(doc);
        refreshState(doc);
    });
}

/**
 * Removes a layout. If it was the active one the app's defaults take over, but the columns on
 * screen are left exactly as they are — deleting the record of an arrangement does not disturb
 * the arrangement.
 * @async
 * @param {string} name
 * @returns {Promise<void>}
 */
export function deleteLayout(name) {
    return enqueue(async () => {
        const doc = await readLayouts();
        delete doc.layouts[name];
        if (doc.active === name) doc.active = null;
        await writeLayouts(doc);
        refreshState(doc);
    });
}

/**
 * Switches to a layout, or to the app's built-in defaults when given null.
 *
 * Choosing the defaults clears columnLayout rather than filling it, which is what hands the next
 * render back to resolveColumns() and its schema order.
 *
 * @async
 * @param {string|null} name
 * @returns {Promise<void>}
 */
export function setActiveLayout(name) {
    return enqueue(async () => {
        const doc = await readLayouts();
        doc.active = (name && doc.layouts[name]) ? name : null;
        await writeLayouts(doc);
        refreshState(doc);

        if (doc.active) applyLayoutToColumnLayout(doc.layouts[doc.active].columns ?? []);
        else TABLE_VIEW_COLUMNS.columnLayout.clear();
    });
}
