import { appState } from '../services/store.js';
import { propertyType } from '../services/property-type.js';
import { getFileDataAndMetadata } from '../services/file-parsing/file-info.js';
import { buildParentMap } from '../services/file-parsing/tag-taxon.js';
import { invalidateTagCache } from '../autocomplete/tag-cache.js';
import { invalidateNoteNameIndex } from '../services/internal-links/note-name-index.js';
import { checkFileErrors } from '../services/file-parsing/file-errors.js';
import { renderTagTaxonomy } from '../ui/render-tag-taxonmy.js';
import { renderFiles } from '../ui/ui-functions-render/a-render-all-files.js';
import { searchFiles } from '../ui/ui-functions-search/a-search-files.js';
import { processSeachResults } from '../ui/ui-functions-search/a-search-orchestrator.js';
import { sortAppStateFiles } from '../services/file-object-sort.js';

let queuedRefresh = null;

/**
 * Queues the post-save refresh. Deferred to an idle callback because the work below is the
 * most expensive thing in the save path, and autosave can fire it while the user is still
 * typing. Only one refresh is ever pending — a burst of autosaves replaces the queued one
 * rather than stacking up full re-renders, and the newer snapshot reads fresher disk state
 * anyway.
 *
 * **For a save the user is waiting on, call refreshFilesNow instead.** The deferral is right for a
 * save nobody asked for, and wrong for one somebody just pressed a key to finish: an idle callback
 * can wait up to its two-second timeout on a busy main thread, and the table would sit there
 * showing the old value for all of it.
 *
 * @param {{ filepath: string, filename: string }} snapshot
 * @param {boolean} [resort=true] - Whether to put the file back in sort order afterwards.
 * @returns {void}
 */
export function refreshFileAfterSave(snapshot, resort = true) {
    if (queuedRefresh !== null) cancelIdleCallback(queuedRefresh);
    queuedRefresh = requestIdleCallback(() => {
        queuedRefresh = null;
        refreshFilesNow([snapshot], resort);
    }, { timeout: 2000 });
}

/**
 * The same refresh without the wait, for a save the user is standing over — like a cell edit.
 *
 * **Takes a list, and renders once however long it is.** One snapshot at a time would be one sort,
 * one filter pass and one view transition *per file* — twelve of each for a twelve-file undo,
 * interrupting one another — so the re-read and the render are separate functions below and this is
 * what puts them back together.
 *
 * **Awaited, and worth awaiting**: the rows the caller wants to mark do not exist until it returns.
 * That is what lets an undo flash the cells it changed — see plans/table-undo-stack.md §10.2.
 *
 * **A snapshot carrying `written` is not read back.** That is the text the write just verified, so
 * reading it again was a second read per file for nothing — at a thousand files, a thousand. Only
 * `getFile()` is still asked, for the size and the modified time the file system alone knows.
 *
 * @param {Array<{ filepath: string, filename: string, written?: string }>} snapshots - One per
 *   file written.
 * @param {boolean} [resort=true] - Whether to put the files back in sort order afterwards.
 * @returns {Promise<void>}
 */
export async function refreshFilesNow(snapshots, resort = true) {
    try {
        // One lookup table per refresh, rather than a search of every file per file written.
        const indexByPath = new Map(appState.myFiles.map((file, index) => [file.filepath, index]));

        let fullRender = false;
        for (const snapshot of snapshots) {
            // Or-assigned rather than assigned: one file gaining or losing a key can change the
            // columns, and the render that draws them has to be a full one however many files were
            // quiet.
            fullRender = await rereadFile(snapshot, indexByPath.get(snapshot.filepath)) || fullRender;
        }
        await renderRefreshed(fullRender, resort);
    } catch (err) {
        console.error('Failed to refresh file state after save:', err);
    }
}

/**
 * Re-parses one saved file from disk and updates appState. Renders nothing.
 *
 * @param {{ filepath: string, filename: string, written?: string }} snapshot
 * @param {number|undefined} fileIndex - Where the file sits in appState.myFiles, if it is there.
 * @returns {Promise<boolean>} Whether the file's key set changed, so the next render must be full.
 */
async function rereadFile(snapshot, fileIndex) {
    if (fileIndex === undefined) return false;

    const existingFile = appState.myFiles[fileIndex];

    const freshFile = await getFileDataAndMetadata(existingFile.handle, 0, snapshot.written);

    // The rows can be replaced on their own only while the columns are the ones already drawn, so
    // this asks whether the file's own key set changed — in either direction. A gained key is a
    // column that may not exist yet; a lost one is a column that may now be empty, and an empty
    // column's heading is drawn faded. Counting myFilesProperties instead answered only the first
    // question, because nothing unregisters a property: clearing the last value of a key left the
    // header saying the column still had values until the folder was reloaded.
    const columnsMayHaveChanged =
        Object.keys(existingFile).length !== Object.keys(freshFile).length;

    const tagsHaveChanged = !tagsEqual(existingFile.tags, freshFile.tags);
    const colorHasChanged = existingFile.color !== freshFile.color;

    appState.myFiles[fileIndex] = {
        ...freshFile,
        handle: existingFile.handle,
        internalId: existingFile.internalId,
        filepath: existingFile.filepath,
    };

    // getFileDataAndMetadata only rewrote the parse-time errors; re-run the rest against
    // the new content, so fixing one of two broken links leaves the other one reported.
    checkFileErrors(appState.myFiles[fileIndex]);

    if (colorHasChanged && appState.openFileSnapshot?.filepath === snapshot.filepath) {
        const newColor = freshFile.color ?? '';
        document.getElementById('file-content-header').dataset.color = newColor;
        document.getElementById('file-content-footer').dataset.color = newColor;
        document.getElementById('modal-content').dataset.color = newColor;
    }

    if (tagsHaveChanged) {
        appState.myParentMap = buildParentMap(appState.myFiles);
        invalidateTagCache();
        invalidateNoteNameIndex();
        if (appState.tagTaxonomyVisible) renderTagTaxonomy();
    }

    return columnsMayHaveChanged;
}

/**
 * Re-sorts if asked, re-runs the filters, and renders the file list once.
 *
 * The current page is kept, whether the render happens here or inside processSeachResults: the
 * file list sits behind the open modal, and a save must not silently jump it back to page 1 while
 * the user is typing — nor an edit made on page 3 of a filtered table.
 *
 * **Waits for the rows to be on screen**, which is not the same as waiting for the render call: a
 * view transition draws them a frame later. A caller that marks what it changed — an undo, an edit —
 * would otherwise mark elements about to be replaced. See renderFiles.
 *
 * @param {boolean} fullRender - Whether the header has to be rebuilt as well as the rows.
 * @param {boolean} resort - Whether to put the files back in sort order first.
 * @returns {Promise<void>}
 */
async function renderRefreshed(fullRender, resort) {
    if (resort) {
        const { property, direction } = appState.sortState;
        sortAppStateFiles(property, propertyType(property), direction);
    }

    // One render either way. The filters are re-run first and processSeachResults does the
    // rendering, because it renders anyway — rendering before it meant two full renders and,
    // where a view transition ran, two of those interrupting each other.
    let drawn;
    if (appState.search.filters.size > 0) {
        const filterIds = [...appState.search.filters.keys()];
        filterIds.forEach(id => appState.search.results.delete(id));
        await Promise.all(filterIds.map(id => searchFiles(id)));
        drawn = processSeachResults(fullRender, true);
    } else {
        drawn = renderFiles(fullRender, true);
    }

    await drawn.updateCallbackDone;
}

/**
 * Returns true if two tag Maps have identical child tags and parent sets.
 * @param {Map<string, {parents: Set<string>}>} a
 * @param {Map<string, {parents: Set<string>}>} b
 * @returns {boolean}
 */
function tagsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const [key, valA] of a) {
        const valB = b.get(key);
        if (!valB) return false;
        if (valA.parents.size !== valB.parents.size) return false;
        for (const p of valA.parents) {
            if (!valB.parents.has(p)) return false;
        }
    }
    return true;
}
