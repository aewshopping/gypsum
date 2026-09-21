import { appState } from '../services/store.js';
import { checkFileOnPage } from './pagination/check-file-on-page.js';
import { buildMermaidSource } from '../services/flowchart/mermaid-source.js';
import { renderFlowchartControls } from './ui-functions-flowchart/render-flowchart-controls.js';
import { escapeHtml } from './ui-functions-render/escape-html.js';

/**
 * @file Renders the file list as mermaid flowchart source in a copyable code block.
 *
 * Version 1 stops one step short of drawing the diagram: it writes the syntax out so it can be
 * pasted into a mermaid editor elsewhere. The block is contenteditable purely so it can be
 * selected, copied and tweaked in place — nothing is read back out of it and no note is written.
 *
 * What goes into the source is services/flowchart/mermaid-source.js; this is the layer that decides
 * which files it is asked about and puts the result on the page.
 */

/**
 * Renders the visible files as mermaid flowchart source, under the view's own control row.
 *
 * The control row is part of this output rather than something toggled on and off, which is how
 * the table's row has always worked too: a view's controls exist while the view is rendered and
 * not otherwise, so nothing needs to know which view is showing.
 *
 * `renderEverything` is unused, as it is in the grid and list renderers — it is the uniform
 * signature the switch in ui-functions-render/a-render-all-files.js calls every view with.
 *
 * @param {boolean} renderEverything - Render all files or only filtered ones.
 * @returns {void}
 */
export function renderFileList_flowchart(renderEverything) {

    const drawnFiles = appState.myFiles.filter(file => checkFileOnPage(file.internalId));
    const source = buildMermaidSource(drawnFiles);

    document.getElementById('output').innerHTML =
        renderFlowchartControls() +
        `<pre class="flowchart-code" contenteditable="true" spellcheck="false">${escapeHtml(source)}</pre>`;
}
