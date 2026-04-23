import { appState } from '../../services/store.js';
import { parseContent } from '../../services/parse-content.js';
import { saveBackupEntry } from '../../editing/local-backup.js';
import { loadHistorySelect } from './setup-history-select.js';
import { setIsCurrentVersion } from '../../editing/editable-state.js';
import { fileContentRender } from '../ui-functions-render/render-file-content.js';
import { applyHighlights } from '../ui-functions-highlight/apply-highlights.js';

/**
 * Loads the content of a file, wraps front matter, parses tags and markdown, and then triggers the render.
 * @async
 * @param {string} fileId - The unique id (full path from root) of the file to load content for.
 */
export async function loadContentModal(fileId) {
    const fileHandle = appState.myFileHandlesMap.get(fileId);
    const fileChosen = await fileHandle.getFile();

    const raw = await fileChosen.text();
    // Normalise CRLF/CR to \n on load so the dirty-flag comparison holds:
    // the DOM collapses every line break to a single \n via innerText, while
    // a raw CRLF file would keep \r\n in liveRaw and openNormalized,
    // defeating the trimEnd() equality check.
    const normalized = raw.replace(/\r\n|\r/g, '\n');
    const session = appState.editSession;

    // On initial load, the active content and live content are identical
    session.activeRaw = normalized;
    session.liveRaw = normalized;
    session.openNormalized = normalized.trimEnd();
    session.openTextLen = session.openNormalized.replace(/\n/g, '').length; // \n → <br> in DOM, invisible to textContent
    session.isDirty = false;

    const fileObj = appState.myFiles.find(f => f.id === fileId);
    appState.openFileSnapshot = {
        filepath: fileObj?.filepath ?? fileId,
        filename: fileObj?.filename ?? fileId,
        content: raw,
    };

    session.activeHtml = parseContent(raw);
    session.liveHtml = session.activeHtml;

    setIsCurrentVersion(true);
    document.getElementById('modal-content-text').innerHTML = '';
    fileContentRender();

    await saveBackupEntry(appState.openFileSnapshot, 'open');
    await loadHistorySelect(fileObj?.filename ?? fileId, fileObj?.filepath ?? fileId);
    applyHighlights();

    console.log(fileId);

}
