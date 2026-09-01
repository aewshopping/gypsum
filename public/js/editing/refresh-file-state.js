import { appState, FILE_PROPERTIES } from '../services/store.js';
import { getFileDataAndMetadata } from '../services/file-parsing/file-info.js';
import { buildParentMap } from '../services/file-parsing/tag-taxon.js';
import { invalidateTagCache } from '../autocomplete/tag-cache.js';
import { invalidateNoteNameIndex } from '../services/internal-links/note-name-index.js';
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
 * @param {{ filepath: string, filename: string }} snapshot
 * @returns {void}
 */
export function refreshFileAfterSave(snapshot) {
    if (queuedRefresh !== null) cancelIdleCallback(queuedRefresh);
    queuedRefresh = requestIdleCallback(() => {
        queuedRefresh = null;
        applyRefresh(snapshot);
    }, { timeout: 2000 });
}

/**
 * Re-parses the saved file from disk, updates appState, and re-renders
 * the tag taxonomy and file list.
 * renderFiles keeps the current page: the file list sits behind the open modal, and a
 * save must not silently jump it back to page 1 while the user is typing.
 * @param {{ filepath: string, filename: string }} snapshot
 * @returns {Promise<void>}
 */
async function applyRefresh(snapshot) {
    try {
        const fileIndex = appState.myFiles.findIndex(f => f.filepath === snapshot.filepath);
        if (fileIndex === -1) return;

        const existingFile = appState.myFiles[fileIndex];

        const freshFile = await getFileDataAndMetadata(existingFile.handle, 0);

        const tagsHaveChanged = !tagsEqual(existingFile.tags, freshFile.tags);
        const colorHasChanged = existingFile.color !== freshFile.color;

        appState.myFiles[fileIndex] = {
            ...freshFile,
            handle: existingFile.handle,
            internalId: existingFile.internalId,
            filepath: existingFile.filepath,
        };

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

        const { property, direction } = appState.sortState;
        sortAppStateFiles(property, FILE_PROPERTIES.get(property)?.type ?? 'string', direction);
        renderFiles(true, true);

        if (appState.search.filters.size > 0) {
            const filterIds = [...appState.search.filters.keys()];
            filterIds.forEach(id => appState.search.results.delete(id));
            await Promise.all(filterIds.map(id => searchFiles(id)));
            processSeachResults();
        }
    } catch (err) {
        console.error('Failed to refresh file state after save:', err);
    }
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
