import { viewTransitionsWanted } from '../ui-functions-render/view-transition.js';
import { viewMatrix } from './flowchart-settle-view.js';

/**
 * @file A chart redrawn after a write, settled from the one before it rather than jumping to it.
 * Stage 3 of plans/flowchart-dagre-elk-layout.md.
 *
 * Every render lays the chart out afresh, so a link added or a note made can move boxes. After a
 * write the change is made followable instead:
 *
 * - **The view holds still, or moves to show a new note** — flowchart-settle-view.js works out where it
 *   goes, before pan and zoom are attached; here the move from the held view to that one is animated.
 * - **Notes and link texts glide.** Each animates from where it was on screen to where it now is; a new
 *   note from where it was dropped, or from the stub it was made from. A link text is matched by its
 *   two notes and its words. Lines change shape and cannot be morphed, so the old ones fade out as the
 *   notes set off and the new ones fade in as they arrive.
 *
 * It animates with the Web Animations API rather than a view transition: a view transition captures
 * boxes on the page, and the shapes inside one SVG would only crossfade as a single picture. All of it
 * follows "animate view changes", except where the view ends up, which is not animation. A render that
 * moves nothing animates nothing, so a save that changes no box does not flicker.
 */

const DURATION = 900;            // slow enough to follow a note across the chart
const OLD_FADE_END = 0.35;       // the old lines are gone by this share of the way
const NEW_FADE_START = 0.6;      // and the new ones begin to show from this one

/** What moves: a note's box (`data-key`) and a link's text (`data-link-key`). */
const MOVERS = '[data-key], [data-link-key]';
const keyOf = element => element.dataset.key ?? `link:${element.dataset.linkKey}`;

/**
 * What the chart looks like on screen before it is redrawn: where each box and link text is, and the
 * drawing itself, kept to fade out over the new one.
 *
 * @param {?SVGSVGElement} svg - The chart about to be replaced, or null when none is drawn.
 * @returns {?{centres: Map<string, DOMPoint>, texts: Map<string, DOMPoint>, drawing: SVGGElement, matrix: DOMMatrix, middle: DOMPoint, viewScale: number}}
 *   `centres` holds the boxes alone, which are what the view is held by.
 */
export function snapshotChart(svg) {
    const drawing = svg?.querySelector('.flowchart-drawing');
    if (!drawing) return null;
    const at = selector => new Map([...drawing.querySelectorAll(selector)].map(element => [keyOf(element), centreOf(element)]));
    const view = svg.getBoundingClientRect();
    return {
        centres: at('[data-key]'), texts: at('[data-link-key]'), drawing,
        matrix: DOMMatrix.fromMatrix(drawing.getScreenCTM()),
        middle: new DOMPoint(view.left + view.width / 2, view.top + view.height / 2),
        viewScale: svg.getScreenCTM().a,
    };
}

/**
 * Settles a freshly drawn chart from its snapshot: the view moved from held to final, the boxes and
 * link texts glided, the lines faded — when animation is wanted and something moved.
 *
 * @param {SVGSVGElement} svg - The new chart, pan and zoom attached at the final view.
 * @param {ReturnType<typeof snapshotChart>} before
 * @param {?{fileId: string, x: number, y: number}} arrival - Where a new note came from on screen.
 * @param {{hold: object, final: object}} view - From settledView.
 * @returns {void}
 */
export function settleChart(svg, before, arrival, view) {
    if (!viewTransitionsWanted()) return;
    const drawing = svg.querySelector('.flowchart-drawing');
    // Where the drawing sat on screen in the held view, which is where the glide starts from.
    const held = DOMMatrix.fromMatrix(svg.getScreenCTM()).multiply(viewMatrix(view.hold, svg))
        .multiply(DOMMatrix.fromMatrix(drawing.transform.baseVal[0].matrix));
    const toDrawing = point => held.inverse().transformPoint(point);

    const glides = [];
    for (const element of drawing.querySelectorAll(MOVERS)) {
        const key = keyOf(element);
        const from = before.centres.get(key) ?? before.texts.get(key)
            ?? (arrival && element.dataset.key && element.dataset.fileId === arrival.fileId ? new DOMPoint(arrival.x, arrival.y) : null);
        const box = element.getBBox();
        const own = element.transform.baseVal.numberOfItems ? element.transform.baseVal[0].matrix : { e: 0, f: 0 };
        const start = from && toDrawing(from);
        glides.push({ element, own, by: start && [start.x - (own.e + box.x + box.width / 2), start.y - (own.f + box.y + box.height / 2)] });
    }
    const viewMoves = ['scale', 'x', 'y'].some(k => Math.abs(view.hold[k] - view.final[k]) > 1e-6);
    const moved = viewMoves || glides.some(({ by }) => !by || Math.hypot(...by) > 0.5)
        || before.centres.size + before.texts.size !== glides.length;
    if (!moved) return;

    if (viewMoves) {
        const css = v => `scale(${v.scale}) translate(${v.x}px, ${v.y}px)`;
        svg.querySelector('.pz-group').animate([{ transform: css(view.hold) }, { transform: css(view.final) }],
            { duration: DURATION, easing: 'ease-in-out' });
    }
    for (const { element, own, by } of glides) {
        if (!by) {
            fade(element, [0, 0, 1]);
            continue;
        }
        element.animate([
            { transform: `translate(${own.e + by[0]}px, ${own.f + by[1]}px)` },
            { transform: `translate(${own.e}px, ${own.f}px)` },
        ], { duration: DURATION, easing: 'ease-in-out' });
    }
    drawing.querySelectorAll(`:scope > :not(${MOVERS})`).forEach(element => fade(element, [0, 0, 1]));
    fadeOutOld(svg, before, new Set(glides.map(({ element }) => keyOf(element))), view);
}

/**
 * The old drawing laid over the new one exactly where it was on screen, less the boxes and texts the
 * new chart still has, faded out and then taken away. It takes no presses.
 */
function fadeOutOld(svg, before, keys, view) {
    const old = before.drawing;
    old.querySelectorAll(MOVERS).forEach(element => { if (keys.has(keyOf(element))) element.remove(); });
    old.classList.replace('flowchart-drawing', 'flowchart-leaving');
    const holdGroup = DOMMatrix.fromMatrix(svg.getScreenCTM()).multiply(viewMatrix(view.hold, svg));
    const place = holdGroup.inverse().multiply(before.matrix);
    old.setAttribute('transform', `matrix(${place.a} ${place.b} ${place.c} ${place.d} ${place.e} ${place.f})`);
    svg.querySelector('.pz-group').prepend(old);
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
