import { appState } from '../../services/store.js';
import { marked }  from '../../services/marked.eos.js';
import { tagParser } from '../../services/file-tagparser.js';
import { wrapFrontMatter } from '../../services/file-parsing/yaml-wrap-frontmatter.js';
import { highlightPropMatches } from '../ui-functions-highlight/apply-highlights.js';
import { saveBackupEntry } from '../../editing/local-backup.js';
import { loadHistorySelect } from './setup-history-select.js';

const YAML_WRAP_BEFORE = "<pre class='pre-bg'><code>";
const YAML_WRAP_AFTER = "</pre></code>";

let file_content;               // current working content (may be a historical snapshot)
let file_content_tagged_parsed;
let current_file_content;               // preserved on open — never overwritten by history selection
let current_file_content_tagged_parsed;

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
    saveBackupEntry(appState.openSnapshot, 'open');
    loadHistorySelect(file_to_open, file_content);

    const file_content_yamlwrapped = wrapFrontMatter(file_content, YAML_WRAP_BEFORE, YAML_WRAP_AFTER);
    const file_content_tagged = tagParser(file_content_yamlwrapped);
    file_content_tagged_parsed = marked(file_content_tagged);
    current_file_content_tagged_parsed = file_content_tagged_parsed;

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
    fileContentRender();
}

/**
 * Loads a historical content string into the modal, updating the module-level
 * vars so that the html/txt render toggle continues to work correctly.
 * @param {string} rawContent - The raw file text to render.
 * @returns {void}
 */
export function loadHistoricalContent(rawContent) {
    file_content = rawContent;
    const wrapped = wrapFrontMatter(rawContent, YAML_WRAP_BEFORE, YAML_WRAP_AFTER);
    file_content_tagged_parsed = marked(tagParser(wrapped));
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
      preElement.textContent = file_content; // Safe escaping - hence can't use template literal sadly
      textbox.appendChild(preElement);

    } else {

      textbox.innerHTML = file_content_tagged_parsed;

    }

    highlightPropMatches();

}
