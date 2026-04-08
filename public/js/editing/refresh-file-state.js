import { appState } from '../services/store.js';
import { getFileDataAndMetadata } from '../services/file-parsing/file-info.js';
import { buildParentMap } from '../services/file-parsing/tag-taxon.js';
import { renderTagTaxonomy } from '../ui/render-tag-taxonmy.js';
import { renderData } from '../ui/ui-functions-render/a-render-all-files.js';
import { searchFiles } from '../ui/ui-functions-search/a-search-files.js';
import { processSeachResults } from '../ui/ui-functions-search/a-search-orchestrator.js';

/**
 * Re-parses the saved file from disk, updates appState, and re-renders
 * the tag taxonomy and file list. Called fire-and-forget after a successful
 * explicit save so the popover is shown immediately while state refreshes
 * in the background. Not called on autosave — only on user-initiated saves.
 * @param {{ filepath: string, filename: string }} snapshot
 * @returns {Promise<void>}
 */
export async function refreshFileAfterSave(snapshot) {
    try {
        const fileIndex = appState.myFiles.findIndex(f => f.filepath === snapshot.filepath);
        if (fileIndex === -1) return;

        const existingFile = appState.myFiles[fileIndex];
        const loadOrder = parseInt(existingFile.id.slice(1), 10);

        const freshFile = await getFileDataAndMetadata(existingFile.handle, loadOrder);

        const tagsHaveChanged = !tagsEqual(existingFile.tags, freshFile.tags);
        const colorHasChanged = existingFile.color !== freshFile.color;

        appState.myFiles[fileIndex] = {
            ...freshFile,
            handle: existingFile.handle,
            id: existingFile.id,
            filepath: existingFile.filepath,
        };

        if (colorHasChanged && appState.openFileSnapshot?.filepath === snapshot.filepath) {
            const newColor = freshFile.color ?? '';
            document.getElementById('file-content-header').dataset.color = newColor;
            document.getElementById('modal-content').dataset.color = newColor;
        }

        if (tagsHaveChanged) {
            appState.myParentMap = buildParentMap(appState.myFiles);
            renderTagTaxonomy();
        }

        renderData();

        if (appState.search.filters.size > 0) {
            const filterIds = [...appState.search.filters.keys()];
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
