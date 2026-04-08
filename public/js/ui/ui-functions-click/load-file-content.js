import { appState } from '../../services/store.js';
import { parseContent } from '../../services/parse-content.js';
import { highlightPropMatches } from '../ui-functions-highlight/apply-highlights.js';
import { applyDiffHighlights, clearDiffHighlights } from '../ui-functions-highlight/diff-highlight.js';
import { saveBackupEntry } from '../../editing/local-backup.js';
import { loadHistorySelect } from './setup-history-select.js';
import { getIsCurrentVersion, setIsCurrentVersion } from '../../editing/editable-state.js';
import { scheduleAutosave } from '../../editing/autosave.js';

// Represents the content currently visible in the modal (could be historical)
let activeRawContent;
let activeHtmlContent;

// Represents the "true" current state of the file, preserved during history browsing
let liveRawContent;
let liveHtmlContent;

// Normalised baseline set once when the file opens: \r\n unified, trailing whitespace
// stripped. Matches the form contentEditable returns via innerText.
let openContentNormalized;

// Normalised form of the live content, kept in sync with liveRawContent on each input
// event. innerText already unifies line endings to \n, so only trimEnd() is needed here.
// Both variables are pre-computed so hasUnsavedChanges() is a single !== with no runtime
// transformation on either side.
let liveContentNormalized;

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
    openContentNormalized = activeRawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
    liveContentNormalized = openContentNormalized;

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
    console.log(fileToOpen);
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

    // apply search highlights if any
    highlightPropMatches();

    // apply diff highlights if a prior version
    if (getIsCurrentVersion()) {
        clearDiffHighlights();
    } else {
        // Compare the historical "active" content against the "live" current version
        applyDiffHighlights(activeRawContent, liveRawContent);
    }

    updateUnsavedIndicator();
}

/**
 * Saves the current text content of the editable pre element to module state.
 * @param {Event} evt - The input event from the contentEditable pre element.
 */
export function handleFileContentInput(evt) {
    activeRawContent = evt.target.innerText;
    liveRawContent = activeRawContent;
    liveContentNormalized = liveRawContent.trimEnd();
    updateUnsavedIndicator();
    scheduleAutosave();
}

/**
 * Returns true if the live content differs from the content when the modal was opened.
 * Compares against openContentNormalized (computed once on load) to avoid false positives
 * from line-ending differences (\r\n vs \n) between the raw file and what contentEditable
 * returns via innerText.
 * @returns {boolean}
 */
export function hasUnsavedChanges() {
    return liveContentNormalized !== openContentNormalized;
}

/**
 * Resets the saved baseline to the current live content.
 * Called after a successful save so that hasUnsavedChanges() returns false
 * and the unsaved-changes indicator is cleared.
 * @returns {void}
 */
export function resetUnsavedBaseline() {
    openContentNormalized = liveContentNormalized;
}

/**
 * Appends a black circle (●) to the filename in the history select button when the
 * current version has unsaved changes, and removes it otherwise.
 * Only shown when viewing the current version — not for historical snapshots.
 * @returns {void}
 */
export function updateUnsavedIndicator() {
    const modalContentDiv = document.getElementById("modal-content");

    const isUnsaved = getIsCurrentVersion() && hasUnsavedChanges();

    // If isUnsaved is true, 'saved' is removed. If false, 'saved' is added.
    // this class triggers css style changes
    modalContentDiv.classList.toggle("saved", !isUnsaved);
}