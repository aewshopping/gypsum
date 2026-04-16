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

// The <pre> renders newlines as <br> elements. pre.textContent ignores <br> (non-layout-
// forcing); pre.innerText converts each <br> to \n (layout-forcing). Stripping \n from
// openContentNormalized gives the equivalent textContent length, used in handleFileContentInput
// as a cheap gate: if lengths differ the content definitely changed and we skip the innerText
// read entirely; only when lengths match do we pay for the full innerText comparison.
let openTextContentLength = 0;

// True when the user has made edits not yet matching the open baseline.
let isDirtyFlag = false;

/**
 * Pulls the current editable content from the DOM into liveRawContent / activeRawContent.
 * innerText is not read in the input hot path because it forces a synchronous layout flush.
 * Instead, consumers that need up-to-date content (toggle, history browse) call this
 * function lazily, paying the layout cost only when they actually need the value.
 */
function syncFromDom() {
    if (!isDirtyFlag) return;
    if (!appState.editState) return; // HTML mode is output-only; never read content from it
    const pre = document.querySelector('#modal-content-text .text-editor');
    if (!pre) return;
    liveRawContent = pre.innerText;
    activeRawContent = liveRawContent;
}

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
    openTextContentLength = openContentNormalized.replace(/\n/g, '').length; // \n → <br> in DOM, invisible to textContent
    isDirtyFlag = false;

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
        syncFromDom();
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
    appState.editState = document.getElementById('render_toggle').checked;
    if (getIsCurrentVersion()) {
        syncFromDom();
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
    renderToggle.checked = appState.editState;
    const isTxtMode = appState.editState;

    if (isTxtMode) {
        textbox.innerHTML = '';
        const preElement = document.createElement('pre');
        preElement.classList.add('pre-text-enlarge');
        preElement.classList.add('text-editor');
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
 * Updates dirty state and the unsaved indicator on each edit.
 * Hot-path design: pre.textContent.length is read on every keystroke because it is
 * non-layout-forcing (raw text nodes only, no CSS). pre.innerText forces a synchronous
 * layout flush and is only read when textContent length matches the open baseline —
 * the rare case where content might have reverted to the original (or a newline was
 * inserted/removed without changing the character count).
 * @param {Event} evt - The input event from the contentEditable pre element.
 */
export function handleFileContentInput(evt) {
    scheduleAutosave();
    const pre = evt.target;
    if (pre.textContent.length !== openTextContentLength) {
        // Fast path: length mismatch means content definitely changed — no innerText read needed
        if (!isDirtyFlag) { isDirtyFlag = true; updateUnsavedIndicator(); }
        return;
    }
    // Slow path: same textContent length — might have reverted; innerText read required
    liveRawContent = pre.innerText;
    activeRawContent = liveRawContent;
    isDirtyFlag = liveRawContent.trimEnd() !== openContentNormalized;
    updateUnsavedIndicator();
}

/**
 * Returns true if the live content differs from the content when the modal was opened.
 * @returns {boolean}
 */
export function hasUnsavedChanges() {
    return isDirtyFlag;
}

/**
 * Returns the current live raw text content of the open file.
 * @returns {string}
 */
export function getLiveRawContent() {
    return liveRawContent;
}

/**
 * Resets the saved baseline to the current live content.
 * Called after a successful save so that hasUnsavedChanges() returns false
 * and the unsaved-changes indicator is cleared.
 * @returns {void}
 */
export function resetUnsavedBaseline() {
    const pre = appState.editState
        ? document.querySelector('#modal-content-text .text-editor')
        : null;
    if (pre) liveRawContent = pre.innerText;
    openContentNormalized = liveRawContent.trimEnd();
    openTextContentLength = openContentNormalized.replace(/\n/g, '').length;
    isDirtyFlag = false;
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
    const isCurrent = getIsCurrentVersion();
    if (modalContentDiv.classList.contains("saved") !== !isUnsaved) {
        modalContentDiv.classList.toggle("saved", !isUnsaved);
    }
    modalContentDiv.classList.toggle("current-version", isCurrent);
}
