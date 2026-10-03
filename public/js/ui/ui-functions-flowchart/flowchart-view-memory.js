import { appState } from '../../services/store.js';
import { readPanZoomState } from '../../svg-pan-zoom/svg-pan-zoom.js';

/**
 * @file The chart's pan and zoom kept while it is off screen — behind the code view or another view —
 * and given back when it is drawn again with the same layout.
 *
 * A redraw with the chart on screen reads the pan and zoom from the chart it replaces. One that follows
 * the code view or another view has nothing to read, so the view is put by on the way out and taken
 * back on the way in, but only when the layout drawn is the one it was put by with: every box where it
 * was. Anything else starts the chart afresh. The viewBox is left out of that question: it follows the
 * viewer's size on screen, which can differ from one drawing to the next with nothing laid out anew.
 */

/**
 * Puts the chart's pan and zoom by, when a chart is on screen. Called before it is taken off.
 * @returns {void}
 */
export function rememberChartView() {
    const container = document.querySelector('.pz-container');
    if (!container) return;
    appState.flowchartView.lastView = { state: readPanZoomState(container), layout: layoutOf(container.querySelector('svg.pz-svg')) };
}

/**
 * The pan and zoom put by for this layout, or null.
 * @param {SVGSVGElement} svg - The chart just drawn.
 * @returns {?object} A pan and zoom state, for attachPanZoom.
 */
export function recalledView(svg) {
    const kept = appState.flowchartView.lastView;
    return kept && kept.layout === layoutOf(svg) ? kept.state : null;
}

/** The layout drawn, as one string: each box's key and place. */
function layoutOf(svg) {
    return [...svg.querySelectorAll('.flowchart-drawing > [data-key]')]
        .map(node => `${node.dataset.key}@${node.getAttribute('transform')}`).join('|');
}
