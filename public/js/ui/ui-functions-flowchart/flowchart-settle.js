import { viewTransitionsWanted } from '../ui-functions-render/view-transition.js';

/**
 * @file A chart redrawn after a write, settled from the one before it rather than jumping to it.
 * Stage 3 of plans/flowchart-dagre-elk-layout.md.
 *
 * Every render lays the chart out afresh, so a link added or a note made can move boxes. After a
 * write, two things keep that followable:
 *
 * - **The view holds still.** The drawing keeps its size on screen — zoom makes up for a viewBox the
 *   new drawing grew or shrank — and the note nearest the middle of the viewer stays where it was, pan
 *   shifted to keep it there, rather than the drawing being re-fitted and re-centred under it.
 * - **Notes glide.** Each note animates from where it was on screen to where it now is; a new note from
 *   where it was dropped, or from the stub it was made from. Lines change shape and cannot be morphed,
 *   so the old ones fade out as the notes set off and the new ones fade in as they arrive.
 *
 * It animates with the Web Animations API rather than a view transition: a view transition captures
 * boxes on the page, and the shapes inside one SVG would only crossfade as a single picture. The
 * glide follows "animate view changes"; the view holding still does not, since it is not animation.
 * A render that moves nothing animates nothing, so a save that changes no box does not flicker.
 */

const DURATION = 900;            // slow enough to follow a note across the chart
const OLD_FADE_END = 0.35;       // the old lines are gone by this share of the way
const NEW_FADE_START = 0.6;      // and the new ones begin to show from this one

/**
 * What the chart looks like on screen before it is redrawn: each box's centre, and the drawing itself,
 * kept to fade out over the new one.
 *
 * @param {?SVGSVGElement} svg - The chart about to be replaced, or null when none is drawn.
 * @returns {?{centres: Map<string, DOMPoint>, drawing: SVGGElement, matrix: DOMMatrix, middle: DOMPoint, viewScale: number}}
 */
export function snapshotChart(svg) {
    const drawing = svg?.querySelector('.flowchart-drawing');
    if (!drawing) return null;
    const centres = new Map([...drawing.querySelectorAll('[data-key]')].map(node => [node.dataset.key, centreOf(node)]));
    const view = svg.getBoundingClientRect();
    return {
        centres, drawing,
        matrix: DOMMatrix.fromMatrix(drawing.getScreenCTM()),
        middle: new DOMPoint(view.left + view.width / 2, view.top + view.height / 2),
        viewScale: svg.getScreenCTM().a,
    };
}

/**
 * The zoom to restore so the new drawing is the size on screen the old one was: a viewBox that grew
 * to fit a taller drawing would otherwise shrink everything. Asked after drawing, before pan and zoom
 * are attached; kept within the zoom slider's range.
 *
 * @param {SVGSVGElement} svg - The new chart, its viewBox set.
 * @param {ReturnType<typeof snapshotChart>} before
 * @param {?{scale: number}} state - The pan and zoom read from the old chart.
 * @param {HTMLInputElement} slider - The zoom slider, whose min and max bound the zoom.
 * @returns {?object} The state, its zoom made up.
 */
export function heldZoom(svg, before, state, slider) {
    if (!state) return state;
    const scale = state.scale * before.viewScale / svg.getScreenCTM().a;
    return { ...state, scale: Math.min(Number(slider.max), Math.max(Number(slider.min), scale)) };
}

/**
 * Settles a freshly drawn chart from its snapshot: pan shifted so the anchor note holds still, then
 * the notes glided and the lines faded, when animation is wanted and something moved.
 *
 * @param {SVGSVGElement} svg - The new chart, pan and zoom attached.
 * @param {ReturnType<typeof snapshotChart>} before
 * @param {?{fileId: string, x: number, y: number}} arrival - Where a new note came from on screen.
 * @returns {void}
 */
export function settleChart(svg, before, arrival) {
    const drawing = svg.querySelector('.flowchart-drawing');
    const nodes = [...drawing.querySelectorAll('[data-key]')];
    holdAnchor(svg, nodes, before);

    const starts = new Map();
    for (const node of nodes) {
        const from = before.centres.get(node.dataset.key)
            ?? (arrival && node.dataset.fileId === arrival.fileId ? new DOMPoint(arrival.x, arrival.y) : null);
        if (from) starts.set(node, from);
    }
    const moved = [...starts].some(([node, from]) => distance(centreOf(node), from) > 0.5)
        || nodes.length !== before.centres.size || nodes.length !== starts.size;
    if (!moved || !viewTransitionsWanted()) return;

    const scale = drawing.getScreenCTM().a;
    for (const node of nodes) {
        const from = starts.get(node);
        const { e: x, f: y } = node.transform.baseVal[0].matrix;
        if (!from) {
            fade(node, [0, 0, 1]);
            continue;
        }
        const now = centreOf(node);
        const dx = (from.x - now.x) / scale, dy = (from.y - now.y) / scale;
        node.animate([
            { transform: `translate(${x + dx}px, ${y + dy}px)` },
            { transform: `translate(${x}px, ${y}px)` },
        ], { duration: DURATION, easing: 'ease-in-out' });
    }
    drawing.querySelectorAll(':scope > :not([data-key])').forEach(element => fade(element, [0, 0, 1]));
    fadeOutOld(svg, before, new Set(nodes.map(node => node.dataset.key)));
}

/**
 * Shifts pan so the note that was nearest the middle of the viewer is where it was on screen.
 * @param {SVGSVGElement} svg
 * @param {SVGGElement[]} nodes - The new chart's boxes.
 * @param {ReturnType<typeof snapshotChart>} before
 * @returns {void}
 */
function holdAnchor(svg, nodes, before) {
    const kept = nodes.filter(node => before.centres.has(node.dataset.key));
    if (kept.length === 0) return;
    const anchor = kept.reduce((best, node) =>
        distance(before.centres.get(node.dataset.key), before.middle) < distance(before.centres.get(best.dataset.key), before.middle)
            ? node : best);
    const was = before.centres.get(anchor.dataset.key), now = centreOf(anchor);

    const group = svg.querySelector('.pz-group');
    const [zoom, pan] = [group.transform.baseVal[0], group.transform.baseVal[1]];
    const perUnit = zoom.matrix.a * svg.getScreenCTM().a;
    pan.setTranslate(pan.matrix.e + (was.x - now.x) / perUnit, pan.matrix.f + (was.y - now.y) / perUnit);
}

/**
 * The old drawing laid over the new one exactly where it was on screen, less the boxes the new chart
 * still has, faded out and then taken away. It takes no presses.
 */
function fadeOutOld(svg, before, keys) {
    const old = before.drawing;
    old.querySelectorAll('[data-key]').forEach(node => { if (keys.has(node.dataset.key)) node.remove(); });
    old.classList.replace('flowchart-drawing', 'flowchart-leaving');
    const parent = svg.querySelector('.pz-group');
    const place = DOMMatrix.fromMatrix(parent.getScreenCTM()).inverse().multiply(before.matrix);
    old.setAttribute('transform', `matrix(${place.a} ${place.b} ${place.c} ${place.d} ${place.e} ${place.f})`);
    parent.prepend(old);
    fade(old, [1, 0, 0]).finished.finally(() => old.remove());
}

/** Fades an element through three opacities: at the start, at the share of the way given, at the end. */
function fade(element, [start, middle, end]) {
    const at = start > end ? OLD_FADE_END : NEW_FADE_START;
    return element.animate([{ opacity: start }, { opacity: middle, offset: at }, { opacity: end }], { duration: DURATION });
}

function centreOf(element) {
    const box = element.getBoundingClientRect();
    return new DOMPoint(box.left + box.width / 2, box.top + box.height / 2);
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}
