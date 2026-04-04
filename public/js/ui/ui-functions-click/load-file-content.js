import { appState } from '../../services/store.js';
import { parseContent } from '../../services/parse-content.js';
import { highlightPropMatches } from '../ui-functions-highlight/apply-highlights.js';
import { applyDiffHighlights, clearDiffHighlights } from '../ui-functions-highlight/diff-highlight.js';
import { saveBackupEntry } from '../../editing/local-backup.js';
import { loadHistorySelect } from './setup-history-select.js';
import { getIsCurrentVersion, setIsCurrentVersion } from '../../editing/editable-state.js';
import { scheduleAutosave } from './autosave-file.js';

// Represents the content currently visible in the modal (could be historical)
let activeRawContent; 
let activeHtmlContent;

// Represents the "true" current state of the file, preserved during history browsing
let liveRawContent; 
let liveHtmlContent;

/**
 * Loads the content of a file, wraps front matter, parses tags and markdown, and then triggers the render.
 * @async
 * @param {string} fileToOpen - The name of the file to load content for.
 */
export async function loadContentModal(fileToOpen) {
    const fileHandle = appState.myFileHandlesMap.get(fileToOpen);
    const fileChosen = await fileHandle.getFile();
    
    // On initial load, the active content and live content are identical
    activeRawContent = await fileChosen.text();
    liveRawContent = activeRawContent;

    const fileObj = appState.myFiles.find(f => f.filename === fileToOpen);
    appState.openFileSnapshot = {
        filepath: fileObj?.filepath ?? fileToOpen,
        filename: fileToOpen,
        content: activeRawContent,
    };

    activeHtmlContent = parseContent(activeRawContent);
    liveHtmlContent = activeHtmlContent;

    setIsCurrentVersion(true);
    fileContentRender();

    await saveBackupEntry(appState.openFileSnapshot, 'open');
    loadHistorySelect(fileToOpen);
}

/**
 * Restores the modal to the live file content (undoes any historical selection).
 */
export function restoreCurrentContent() {
    activeRawContent = liveRawContent;
    activeHtmlContent = liveHtmlContent;
    setIsCurrentVersion(true);
    fileContentRender();
}

/**
 * Loads a historical content string into the modal.
 * @param {string} historicalRaw - The raw file text from history to render.
 */
export function loadHistoricalContent(historicalRaw) {
    if (getIsCurrentVersion()) {
        // liveRawContent is kept current by the input listener; ensure HTML is in sync
        liveHtmlContent = parseContent(liveRawContent);
    }

    setIsCurrentVersion(false);
    activeRawContent = historicalRaw;
    activeHtmlContent = parseContent(historicalRaw);
    fileContentRender();
}

/**
 * Handles the html/txt render toggle and re-parses in-progress edits.
 */
export function handleToggleRenderText() {
    if (getIsCurrentVersion()) {
        // activeRawContent is kept current by the input listener; re-parse for HTML mode
        activeHtmlContent = parseContent(activeRawContent);
        liveHtmlContent = activeHtmlContent;
    }
    fileContentRender();
}

/**
 * Renders the active content into the modal.
 */
export function fileContentRender() {
    const textbox = document.getElementById('modal-content-text');
    const renderToggle = document.getElementById('render_toggle');
    const isTxtMode = renderToggle.checked;

    if (isTxtMode) {
        textbox.innerHTML = '';
        const preElement = document.createElement('pre');
        preElement.classList.add('pre-text-enlarge');
        // Only allow editing if we are on the current (live) version
        preElement.contentEditable = getIsCurrentVersion() ? 'plaintext-only' : 'false';
        preElement.innerHTML = activeRawContent
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\r\n|\r|\n/g, '<br>');
        if (getIsCurrentVersion()) {
            preElement.dataset.action = 'file-content-edit';
        }
        textbox.appendChild(preElement);
    } else {
        textbox.innerHTML = activeHtmlContent;
    }

    const saveBtnContainer = document.getElementById('save-btn-container');
    if (saveBtnContainer) {
        saveBtnContainer.hidden = !(isTxtMode && getIsCurrentVersion());
    }

    // apply search highlights if any
    highlightPropMatches();

    // apply diff highlights if a prior version
    if (getIsCurrentVersion()) {
        clearDiffHighlights();
    } else {
        // Compare the historical "active" content against the "live" current version
        applyDiffHighlights(activeRawContent, liveRawContent);
    }
}

/**
 * Saves the current text content of the editable pre element to module state.
 * @param {Event} evt - The input event from the contentEditable pre element.
 */
export function handleFileContentInput(evt) {
    activeRawContent = evt.target.innerText;
    liveRawContent = activeRawContent;
    scheduleAutosave();
}

/**
 * Returns true if the live content differs from the content when the modal was opened.
 * @returns {boolean}
 */
export function hasUnsavedChanges() {
    return liveRawContent !== appState.openFileSnapshot?.content;
}