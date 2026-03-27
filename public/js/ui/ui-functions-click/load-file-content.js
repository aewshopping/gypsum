import { appState } from '../../services/store.js';
import { parseContent } from '../../services/parse-content.js';
import { highlightPropMatches } from '../ui-functions-highlight/apply-highlights.js';
import { applyDiffHighlights, clearDiffHighlights } from '../ui-functions-highlight/diff-highlight.js';
import { saveBackupEntry } from '../../editing/local-backup.js';
import { loadHistorySelect } from './setup-history-select.js';
import { getIsCurrentVersion, setIsCurrentVersion } from '../../editing/editable-state.js';
import { capturePreEdits } from '../../editing/capture-pre-edits.js';

let file_content;               // current working content (may be a historical snapshot)
let file_content_tagged_parsed;
let current_file_content;               // preserved on open — never overwritten by history selection
let current_file_content_tagged_parsed;
let current_historical_line_refs = null; // lineRefs of the historical entry currently displayed

/**
 * Loads the content of a file, wraps front matter, parses tags and markdown, and then triggers the render.
 * Also fires a backup write and concurrently populates the history select.
 * @async
 * @param {string} file_to_open - The name of the file to load content for.
 * @returns {Promise<void>}
 */
export async function loadContentModal (file_to_open) {

    const file_handle = appState.myFileHandlesMap.get(file_to_open);

    const file_chosen = await file_handle.getFile();
    file_content = await file_chosen.text();
    current_file_content = file_content;

    const file_obj = appState.myFiles.find(f => f.filename === file_to_open);
    appState.openSnapshot = {
        filepath: file_obj?.filepath ?? file_to_open,
        filename: file_to_open,
        content: file_content,
    };

    // Fire backup write and history load concurrently — intentionally not awaited.
    // Reading before the write completes means history shows only past states.
    // The save resolves with the lineRefs for the current content, which are stored
    // in appState so the diff highlighter can use them when a historical version is selected.
    saveBackupEntry(appState.openSnapshot, 'open').then(refs => {
        appState.currentVersionLineRefs = refs;
    });
    loadHistorySelect(file_to_open, file_content);

    file_content_tagged_parsed = parseContent(file_content);
    current_file_content_tagged_parsed = file_content_tagged_parsed;

    current_historical_line_refs = null;
    setIsCurrentVersion(true);
    fileContentRender();
}

/**
 * Restores the modal to the current file content (undoes any historical selection).
 * Uses the preserved current vars so that toggling html/txt works correctly.
 * @returns {void}
 */
export function restoreCurrentContent() {
    file_content = current_file_content;
    file_content_tagged_parsed = current_file_content_tagged_parsed;
    current_historical_line_refs = null;
    setIsCurrentVersion(true);
    fileContentRender();
}

/**
 * Loads a historical content string into the modal, updating the module-level
 * vars so that the html/txt render toggle continues to work correctly.
 * @param {string} rawContent - The raw file text to render.
 * @param {number[]|null} lineRefs - lineRefs from the history entry, for diff highlighting.
 * @returns {void}
 */
export function loadHistoricalContent(rawContent, lineRefs = null) {
    if (getIsCurrentVersion()) {
        const editedText = capturePreEdits();
        if (editedText !== null) {
            current_file_content = editedText;
            current_file_content_tagged_parsed = parseContent(current_file_content);
        }
        // else: current_* already in sync (handleToggleRenderText keeps them updated)
    }
    current_historical_line_refs = lineRefs;
    setIsCurrentVersion(false);
    file_content = rawContent;
    file_content_tagged_parsed = parseContent(rawContent);
    fileContentRender();
}

/**
 * Handles the html/txt render toggle. Captures any edits made in the txt <pre>
 * back into the module-level content vars before re-rendering, so that switching
 * to html does not discard in-progress edits. Also keeps current_* vars in sync
 * so that loadHistoricalContent never sees stale current content.
 * @returns {void}
 */
export function handleToggleRenderText() {
    const editedText = capturePreEdits();
    if (editedText !== null) {
        file_content = editedText;
        file_content_tagged_parsed = parseContent(file_content);
        current_file_content = editedText;
        current_file_content_tagged_parsed = file_content_tagged_parsed;
    }
    fileContentRender();
}

/**
 * Renders the loaded file content into the modal text area.
 * Can toggle between rendered markdown and raw text.
 * @returns {void}
 */
export function fileContentRender() {

    const textbox = document.getElementById('modal-content-text');
    const renderToggle = document.getElementById('render_toggle');

    const isChecked = renderToggle.checked;

    if (isChecked) {

      textbox.innerHTML = '';
      const preElement = document.createElement('pre');
      preElement.classList.add('pre-text-enlarge');
      preElement.contentEditable = getIsCurrentVersion() ? 'true' : 'false';
      preElement.textContent = file_content; // Safe escaping - hence can't use template literal sadly
      textbox.appendChild(preElement);

    } else {

      textbox.innerHTML = file_content_tagged_parsed;

    }

    highlightPropMatches();

    if (getIsCurrentVersion()) {
        clearDiffHighlights();
    } else {
        applyDiffHighlights(file_content, current_file_content, current_historical_line_refs);
    }

}
