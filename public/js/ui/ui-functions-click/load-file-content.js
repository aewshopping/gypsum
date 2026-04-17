import { appState } from '../../services/store.js';
import { parseContent } from '../../services/parse-content.js';
import { saveBackupEntry } from '../../editing/local-backup.js';
import { loadHistorySelect } from './setup-history-select.js';
import { setIsCurrentVersion } from '../../editing/editable-state.js';
import { fileContentRender } from '../ui-functions-render/render-file-content.js';
import { resetUndoStacks } from '../../editing/undo/undo-state.js';

/**
 * Loads the content of a file, wraps front matter, parses tags and markdown, and then triggers the render.
 * @async
 * @param {string} fileToOpen - The name of the file to load content for.
 */
export async function loadContentModal(fileToOpen) {
    const fileHandle = appState.myFileHandlesMap.get(fileToOpen);
    const fileChosen = await fileHandle.getFile();

    const raw = await fileChosen.text();
    // Normalise line endings on load: the DOM collapses every CRLF to a single
    // <br>, so liveRaw must use the same \n-only convention or character
    // offsets between the DOM and the buffer drift by the count of preceding
    // \r\n sequences.
    const normalized = raw.replace(/\r\n|\r/g, '\n');
    const session = appState.editSession;

    // On initial load, the active content and live content are identical
    session.activeRaw = normalized;
    session.liveRaw = normalized;
    session.openNormalized = normalized.trimEnd();
    session.openTextLen = session.openNormalized.replace(/\n/g, '').length; // \n → <br> in DOM, invisible to textContent
    session.isDirty = false;
    resetUndoStacks();

    const fileObj = appState.myFiles.find(f => f.filename === fileToOpen);
    appState.openFileSnapshot = {
        filepath: fileObj?.filepath ?? fileToOpen,
        filename: fileToOpen,
        content: raw,
    };

    session.activeHtml = parseContent(raw);
    session.liveHtml = session.activeHtml;

    setIsCurrentVersion(true);
    fileContentRender();

    await saveBackupEntry(appState.openFileSnapshot, 'open');
    loadHistorySelect(fileToOpen);
    console.log(fileToOpen);
}
