/**
 * @file Reads and writes .gypsum/table_layouts.gypsum — every saved layout for the folder, which
 * one is in use, the type the user has chosen for each property, and which property fills each
 * part of the flowchart.
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
import { layoutFromColumnLayout, applyLayoutToColumnLayout, applyStickyCountFromLayout,
         propertyTypesFromState, applyPropertyTypesFromFile,
         flowchartOptionsFromState, applyFlowchartOptionsFromFile } from './layout-apply.js';

/**
 * 2 since propertyTypes moved out of the layouts and up to the top of the document.
 *
 * There is no migration branch: the app is still in development, and "delete all layouts" is the
 * way past a version 1 file. A version 1 file left in place is read as a document with no
 * propertyTypes, and the types it kept on its columns are simply not read — so it loses its types
 * rather than breaking. The number is here so a later shape change has something to branch on.
 *
 * **It tracks breaking changes only, which is why `flowchart` arriving did not move it.** Adding a
 * top-level key costs nothing either way: readLayouts already defaults one that is missing, and a
 * reader of this version ignores one it does not know. Bumping for it would spend the number on a
 * change no branch will ever be written for, and leave the next real break with no clean signal.
 */
const LAYOUT_VERSION = 2;

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
 * No layouts, no chosen types, no flowchart choices, and the app's built-in defaults in use.
 *
 * Every key readLayouts answers with appears here too. It has to: this is what readLayouts returns
 * for a folder with no file, and a key missing from it would be absent from doc, then absent from
 * the first thing written.
 *
 * @returns {{layoutVersion: number, propertyTypes: object, flowchart: object, active: string|null, layouts: object}}
 */
function emptyDocument() {
    return { layoutVersion: LAYOUT_VERSION, propertyTypes: {}, flowchart: {}, active: null, layouts: {} };
}

/**
 * Reads and parses the layouts file.
 *
 * Returns an empty document for every failure — no directory handle, no .gypsum folder, no file,
 * unparseable JSON — so no caller has to tell "this folder has no layouts" apart from "the
 * layouts could not be read". The distinction would not change what any of them do.
 *
 * **Every key the document carries has to be named here**, because this rebuilds the object rather
 * than spreading what was parsed — a key it does not mention is dropped, and the next writer, which
 * reads through here first, then writes a file without it. That is how a flowchart choice would
 * silently vanish the next time a layout was saved.
 *
 * @async
 * @returns {Promise<{layoutVersion: number, propertyTypes: object, flowchart: object, active: string|null, layouts: object}>}
 */
export async function readLayouts() {
    if (!appState.dirHandle) return emptyDocument();
    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER, { create: false });
        const fileHandle = await gypsumDir.getFileHandle(LAYOUTS_FILENAME, { create: false });
        const parsed = JSON.parse(await (await fileHandle.getFile()).text());
        return {
            layoutVersion: parsed.layoutVersion ?? LAYOUT_VERSION,
            propertyTypes: (parsed.propertyTypes && typeof parsed.propertyTypes === 'object')
                ? parsed.propertyTypes : {},
            flowchart: (parsed.flowchart && typeof parsed.flowchart === 'object')
                ? parsed.flowchart : {},
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
        // Stamped here rather than trusted from the file, so a document this app wrote always says
        // which shape it is in — an older file re-saved is now in the new shape, whatever it said.
        await writable.write(JSON.stringify({ ...doc, layoutVersion: LAYOUT_VERSION }, null, 2));
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
        // Every path through here has just made the columns and the file agree: a load, a save, a
        // rename, a delete, or a switch to another layout.
        isDirty: false,
    };
}

/**
 * `layout-1`, or the first number after it that is not taken.
 *
 * "Save as new" names a layout itself rather than asking for one up front, so the name only has
 * to be unique and obviously provisional — the user is handed it for editing straight away.
 * @param {string[]} names - The layout names already in use.
 * @returns {string}
 */
export function nextLayoutName(names) {
    let n = 1;
    while (names.includes(`layout-${n}`)) n++;
    return `layout-${n}`;
}

/**
 * Loads the chosen types and the active layout into memory, and the layout list into appState.
 *
 * Called by both folder loaders once a directory handle is in place. When there is no file, or
 * the active layout is the app's defaults, columnLayout is left empty and resolveColumns() seeds
 * the defaults on the next render exactly as it always has — an empty Map already means
 * "use the defaults", so a folder that has never saved a layout needs no special case.
 *
 * The types and the flowchart's choices are applied either way, before the layout and outside the
 * `if`. Neither is part of a layout, so a folder using the app's defaults has them too — which is
 * the whole point of their being where they are. Their own clear is inside each apply function, so
 * the folder loaders need know nothing about either.
 *
 * Queued alongside the writes, unlike the other readers, because the picker's reset calls this: a
 * reset that overtook a type still being written would repaint the list from the file as it was
 * before the change.
 *
 * @async
 * @returns {Promise<void>}
 */
export function applyActiveLayout() {
    return enqueue(async () => {
        const doc = await readLayouts();
        refreshState(doc);
        applyPropertyTypesFromFile(doc.propertyTypes);
        applyFlowchartOptionsFromFile(doc.flowchart);

        const { active } = appState.tableLayouts;
        if (active) applyLayoutToColumnLayout(doc.layouts[active].columns ?? []);
        applyStickyCountFromLayout(active ? doc.layouts[active].stickyColumns : 0);
    });
}

/**
 * Writes the chosen types, leaving the layouts and the active pointer as they are.
 *
 * Its own write rather than part of saving a layout, because a type is not part of one. Setting a
 * type is an explicit act with nowhere else to be recorded, so it lands at once — there is no
 * "save types" for the user to forget, and it works with the app's defaults in use, which a layout
 * entry never could.
 *
 * It does **not** call refreshState. That clears isDirty, and a column reorder waiting to be saved
 * must not start looking saved because a type was set beside it.
 *
 * This will create the file in a folder that has never saved a layout. It creates no *layout* —
 * `layouts` stays empty and `active` stays null — so the restraint in saveLayout below still holds:
 * nothing watches for changes, and nothing invents a layout on the user's behalf.
 *
 * @async
 * @returns {Promise<void>}
 */
export function savePropertyTypes() {
    const propertyTypes = propertyTypesFromState();
    return enqueue(async () => {
        const doc = await readLayouts();
        doc.propertyTypes = propertyTypes;
        await writeLayouts(doc);
    });
}

/**
 * Writes the flowchart's chosen properties, leaving everything else in the document as it is.
 *
 * Its own write for savePropertyTypes' reasons, which apply unchanged: these are not part of a
 * layout, so there is no "save" for the user to forget, and they work with the app's default
 * columns in use. It will create the file in a folder that has never saved a layout, and creates
 * no layout — `layouts` stays empty and `active` stays null.
 *
 * It does **not** call refreshState, for savePropertyTypes' reason too: that clears isDirty, and a
 * column reorder waiting to be saved must not start looking saved because a flowchart option was
 * changed beside it.
 *
 * @async
 * @returns {Promise<void>}
 */
export function saveFlowchartOptions() {
    const flowchart = flowchartOptionsFromState();
    return enqueue(async () => {
        const doc = await readLayouts();
        doc.flowchart = flowchart;
        await writeLayouts(doc);
    });
}

/**
 * Deletes the whole file: every layout, the active pointer, every chosen type and the flowchart's
 * chosen properties.
 *
 * The file is removed rather than overwritten with an empty document, which is what clearAllHistory
 * does to history.gypsum. Nothing downstream can tell the difference — readLayouts already answers
 * with an empty document for a file that is not there — but leaving nothing behind is the point:
 * this is how a folder gets out of an older version of the format, and under OPFS there is no file
 * manager to do it with.
 *
 * The columns go back to the app's defaults, unlike deleteLayout, which leaves the arrangement on
 * screen alone. That is right for one layout and wrong for all of them: an arrangement left on
 * screen with `active` reading "default" would be snapped away by the next reset, which re-reads
 * the active layout.
 *
 * @async
 * @returns {Promise<void>}
 */
export function deleteAllLayouts() {
    return enqueue(async () => {
        if (appState.dirHandle) {
            try {
                const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER, { create: false });
                await gypsumDir.removeEntry(LAYOUTS_FILENAME);
            } catch { /* no folder, no file, or no permission — the outcome is the same */ }
        }

        TABLE_VIEW_COLUMNS.columnLayout.clear();
        applyStickyCountFromLayout(0);
        appState.propertyTypes.clear();
        appState.flowchartOptions.clear();
        refreshState(emptyDocument());
    });
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
    const stickyColumns = TABLE_VIEW_COLUMNS.stickyCount;
    return enqueue(async () => {
        const doc = await readLayouts();
        doc.layouts[name] = { updated: new Date().toISOString(), stickyColumns, columns };
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
        applyStickyCountFromLayout(doc.active ? doc.layouts[doc.active].stickyColumns : 0);
    });
}
