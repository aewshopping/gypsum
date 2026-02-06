import { appState } from '../../services/store.js';
import { marked }  from '../../services/marked.eos.js';
import { tagParser } from '../../services/file-tagparser.js';
import { wrapFrontMatter } from '../../services/file-parsing/yaml-wrap-frontmatter.js';
import { highlightPropMatches } from '../ui-functions-highlight/apply-highlights.js';


let file_content; // so we can access the raw file content multiple times without looking it up again
let file_content_tagged_parsed; // // so we can access the rendered file content multiple times

/**
 * Loads the content of a file, wraps front matter, parses tags and markdown, and then triggers the render.
 * @async
 * @param {string} file_to_open - The name of the file to load content for.
 * @returns {Promise<void>}
 */
export async function loadContentModal (file_to_open) {

    const yamlWrapBefore = "<pre class='pre-bg'><code>";
    const yamlWrapAfter = "</pre></code>";
  
    // look up filehandle from Map
    const file_handle = appState.myFileHandlesMap.get(file_to_open);

    const file_chosen = await file_handle.getFile();
    file_content = await file_chosen.text();
    const file_content_yamlwrapped = wrapFrontMatter(file_content, yamlWrapBefore, yamlWrapAfter);
    const file_content_tagged =  tagParser(file_content_yamlwrapped); // need to tagparse before marked parse to avoid parse clash! Also passing target elem in case we can figure out which tags are active...
    file_content_tagged_parsed = marked(file_content_tagged)

    fileContentRender();
 //   textbox.innerHTML = file_content_tagged_parsed;

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