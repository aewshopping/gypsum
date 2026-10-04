import { appState } from '../services/store.js';
import { checkFileOnPage } from './pagination/check-file-on-page.js';
import { buildMermaidSource } from '../services/flowchart/mermaid-source.js';
import { renderFlowchartControls } from './ui-functions-flowchart/render-flowchart-controls.js';
import { escapeHtml } from './ui-functions-render/escape-html.js';
import { renderFlowchartViewer } from './ui-functions-flowchart/render-flowchart-viewer.js';
import { drawFlowchart } from './ui-functions-flowchart/render-svg.js';
import { attachPanZoom, readPanZoomState } from '../svg-pan-zoom/svg-pan-zoom.js';
import { attachFlowchartDrag } from './ui-functions-flowchart/flowchart-node-drag.js';
import { snapshotChart, settleChart } from './ui-functions-flowchart/flowchart-settle.js';
import { settledView } from './ui-functions-flowchart/flowchart-settle-view.js';
import { recalledView } from './ui-functions-flowchart/flowchart-view-memory.js';

/**
 * @file Renders the file list as a flowchart: mermaid source in a copyable code block, or an SVG.
 *
 * Which one is `appState.flowchartView.showSvg`, set by the switch in the view's control row. The two are
 * not connected yet: the SVG is drawn from the files, not from the source, with notes at placeholder
 * positions (plans/completed/flowchart-view.md). The code block is output only — the chart is drawn from
 * the same files, never from it — so it is not editable, and its copy button takes the source whole.
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

    // A render after a write settles from the chart on screen (flowchart-settle.js); any other lays it
    // out afresh. Read once and forgotten, whichever this render is.
    const { settle, arrival } = appState.flowchartView;
    appState.flowchartView.settle = false;
    appState.flowchartView.arrival = null;

    if (!appState.flowchartView.showSvg) {
        output.innerHTML =
            `<div class="flowchart-code-block">
                <pre class="flowchart-code">${escapeHtml(buildMermaidSource(drawnFiles))}</pre>
                <button type="button" class="svg-wrapper-style flowchart-code-copy" data-action="copy-flowchart-code" data-tip="copy the mermaid code">
                    <svg viewBox="0 0 50 50"><use class="copy-mark" href="#icon-copy"></use><use class="copied-badge" href="#icon-tick-badge"></use></svg>
                </button>
            </div>`;
        return;
    }

    // Read before the render replaces the viewer, so a re-render — closing the options dialog, say —
    // leaves the chart zoomed and panned where it was, and the pan toggle as it was.
    const kept = output.querySelector('.pz-container');
    const panZoomState = readPanZoomState(kept);
    const before = settle ? snapshotChart(output.querySelector('svg.pz-svg')) : null;
    // A chart already drawn keeps its container and has what is inside it replaced: the container is
    // what full screen shows, and taking it off the page ends full screen — on every link drawn and
    // every note made.
    const container = kept ?? (output.innerHTML = renderFlowchartViewer(), output.querySelector('.pz-container'));
    if (kept) {
        const fresh = document.createElement('template');
        fresh.innerHTML = renderFlowchartViewer();
        kept.replaceChildren(...fresh.content.firstElementChild.childNodes);
    }
    const svg = container.querySelector('svg.pz-svg');

    drawFlowchart(svg, drawnFiles);
    const view = before && settledView(svg, before, panZoomState, container.querySelector('.pz-zoom-input'), arrival);
    attachPanZoom(container, view ? view.final : panZoomState ?? recalledView(svg));
    if (view) settleChart(svg, before, arrival, view);
    attachFlowchartDrag(svg);
    if (document.fullscreenElement === container) container.querySelector('.pz-fullscreen-check').checked = true;
}
