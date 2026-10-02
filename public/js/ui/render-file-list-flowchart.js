import { appState } from '../services/store.js';
import { checkFileOnPage } from './pagination/check-file-on-page.js';
import { buildMermaidSource } from '../services/flowchart/mermaid-source.js';
import { renderFlowchartControls } from './ui-functions-flowchart/render-flowchart-controls.js';
import { escapeHtml } from './ui-functions-render/escape-html.js';
import { renderFlowchartViewer } from './ui-functions-flowchart/render-flowchart-viewer.js';
import { drawFlowchart } from './ui-functions-flowchart/render-svg.js';
import { attachPanZoom, readPanZoomState } from '../svg-pan-zoom/svg-pan-zoom.js';
import { attachFlowchartDrag } from './ui-functions-flowchart/flowchart-node-drag.js';

/**
 * @file Renders the file list as a flowchart: mermaid source in a copyable code block, or an SVG.
 *
 * Which one is `appState.flowchartView.showSvg`, set by the switch in the view's control row. The two are
 * not connected yet: the SVG is drawn from the files, not from the source, with notes at placeholder
 * positions (plans/flowchart-view.md). The code block is contenteditable purely so it can be
 * selected, copied and tweaked in place — nothing is read back out of it and no note is written.
 *
 * What goes into the source is services/flowchart/mermaid-source.js; this is the layer that decides
 * which files it is asked about and puts the result on the page.
 */

/**
 * Renders the visible files as mermaid source or as an SVG, under the view's own control row.
 *
 * The control row is drawn by this renderer rather than toggled on and off, which is how the
 * table's row works too: a view's controls exist while the view is rendered and not otherwise, so
 * nothing needs to know which view is showing. It goes into #output-controls, on the line the file
 * count is on, which renderFiles empties before any view draws.
 *
 * `renderEverything` is unused, as it is in the grid and list renderers — it is the uniform
 * signature the switch in ui-functions-render/a-render-all-files.js calls every view with.
 *
 * @param {boolean} renderEverything - Render all files or only filtered ones.
 * @returns {void}
 */
export function renderFileList_flowchart(renderEverything) {

    const drawnFiles = appState.myFiles.filter(file => checkFileOnPage(file.internalId));
    const output = document.getElementById('output');

    // The control row goes up onto .output-header, beside the file count, exactly as the table's
    // does — one line above the output instead of two.
    document.getElementById('output-controls').innerHTML = renderFlowchartControls();

    if (!appState.flowchartView.showSvg) {
        output.innerHTML =
            `<pre class="flowchart-code" contenteditable="true" spellcheck="false">${escapeHtml(buildMermaidSource(drawnFiles))}</pre>`;
        return;
    }

    // Read before the render replaces the viewer, so a re-render — closing the options dialog, say —
    // leaves the chart zoomed and panned where it was, and the pan toggle as it was.
    const panZoomState = readPanZoomState(output.querySelector('.pz-container'));
    output.innerHTML = renderFlowchartViewer();
    const container = output.querySelector('.pz-container');

    // As tall as the window leaves below the viewer's top edge, so the whole chart and its zoom
    // controls are on screen without scrolling. Measured here because only the page knows how much
    // sits above it; set before drawing, since the viewBox is sized from the viewer.
    const top = container.getBoundingClientRect().top + window.scrollY;
    container.style.setProperty('--viewer-height', `${Math.max(300, window.innerHeight - top - 16)}px`);
    drawFlowchart(container.querySelector('svg.pz-svg'), drawnFiles);
    attachPanZoom(container, panZoomState);
    attachFlowchartDrag(container.querySelector('svg.pz-svg'));
}
