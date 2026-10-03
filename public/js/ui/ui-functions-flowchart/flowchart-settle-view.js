/**
 * @file Where the view goes when a chart is redrawn after a write: held still, then moved out to show
 * a note just made. Stage 3 of plans/flowchart-dagre-elk-layout.md, beside flowchart-settle.js.
 *
 * Worked out after the new drawing is in the SVG and before pan and zoom are attached, so the answer
 * is handed to attachPanZoom as the state to start from and the pan and zoom code never disagrees
 * with what is on screen. Pan and zoom are the viewer group's `scale(s) translate(t)` about the
 * viewBox's middle, C: a point p of the drawing goes to C + s(p − C + t).
 *
 * - **Held**: zoom makes up for a viewBox the new drawing grew or shrank, so boxes keep their size on
 *   screen, and pan keeps the note that was nearest the middle of the viewer where it was.
 * - **Final**: the held view, unless a note just made would land out of sight — then the view zooms
 *   out about its middle as far as it must to take the note in with everything already in sight, and
 *   pans as little as it must. Never further out than the slider's least zoom, at which the whole
 *   drawing fits.
 */

const REVEAL_MARGIN = 48; // screen pixels kept clear round a revealed note: clear of the zoom slider too

/**
 * The held view and the final one, as pan and zoom states.
 *
 * @param {SVGSVGElement} svg - The new chart, drawn, pan and zoom not yet attached.
 * @param {{centres: Map<string, DOMPoint>, middle: DOMPoint, viewScale: number}} before - From snapshotChart.
 * @param {{scale: number, x: number, y: number, panzoomon: boolean}} state - Read from the old chart.
 * @param {HTMLInputElement} slider - The zoom slider, whose min and max bound the zoom.
 * @param {?{fileId: string}} arrival - The note just made, if any.
 * @returns {{hold: object, final: object}}
 */
export function settledView(svg, before, state, slider, arrival) {
    const toView = DOMMatrix.fromMatrix(svg.getScreenCTM()).inverse();
    const box = svg.viewBox.baseVal;
    const middle = new DOMPoint(box.width / 2, box.height / 2);
    const clamp = s => Math.min(Number(slider.max), Math.max(Number(slider.min), s));

    const scale = clamp(state.scale * before.viewScale / svg.getScreenCTM().a);
    let pan = new DOMPoint(state.x, state.y);
    const anchor = nearestKept(svg, before);
    if (anchor) {
        const was = toView.transformPoint(before.centres.get(anchor.dataset.key));
        const now = toView.transformPoint(centreOf(anchor));
        pan = new DOMPoint((was.x - middle.x) / scale - now.x + middle.x, (was.y - middle.y) / scale - now.y + middle.y);
    }
    const hold = { ...state, scale, x: pan.x, y: pan.y };

    const made = arrival && svg.querySelector(`[data-key][data-file-id="${CSS.escape(arrival.fileId)}"]`);
    return { hold, final: made ? revealed(svg, hold, made, toView, middle, clamp) : hold };
}

/**
 * The pan and zoom state as the matrix it applies, viewBox units to viewBox units.
 * @param {{scale: number, x: number, y: number}} view
 * @param {SVGSVGElement} svg
 * @returns {DOMMatrix}
 */
export function viewMatrix(view, svg) {
    const box = svg.viewBox.baseVal;
    const [cx, cy] = [box.width / 2, box.height / 2];
    return new DOMMatrix().translate(cx, cy).scale(view.scale).translate(view.x - cx, view.y - cy);
}

/** The new chart's note that was nearest the middle of the viewer, among those it still has. */
function nearestKept(svg, before) {
    const kept = [...svg.querySelectorAll('.flowchart-drawing > [data-key]')]
        .filter(node => before.centres.has(node.dataset.key));
    const away = node => distance(before.centres.get(node.dataset.key), before.middle);
    return kept.reduce((best, node) => (!best || away(node) < away(best) ? node : best), null);
}

/** The held view, zoomed out and panned just enough that the new note is in sight. */
function revealed(svg, hold, made, toView, middle, clamp) {
    const sight = rectOf(toView, svg.getBoundingClientRect());         // the viewer, in viewBox units
    const held = viewMatrix(hold, svg);
    const seen = rectOf(held.inverse(), sight);                         // what is in sight, in drawing
    const pad = REVEAL_MARGIN / (svg.getScreenCTM().a * hold.scale);
    const note = grow(rectOf(toView, made.getBoundingClientRect()), pad);
    const noteHeld = rectOf(held, note);
    if (inside(noteHeld, sight)) return hold;

    const want = union(seen, note);
    const scale = clamp(Math.min(hold.scale, sight.width / want.width, sight.height / want.height));
    // Zoomed about the middle of what is in sight, then slid as little as fits the note in.
    const centre = new DOMPoint(seen.x + seen.width / 2, seen.y + seen.height / 2);
    const goal = new DOMPoint(sight.x + sight.width / 2, sight.y + sight.height / 2);
    let x = (goal.x - middle.x) / scale - centre.x + middle.x;
    let y = (goal.y - middle.y) / scale - centre.y + middle.y;
    const shown = rectOf(viewMatrix({ scale, x, y }, svg), want);
    x += fit(shown.x, shown.width, sight.x, sight.width) / scale;
    y += fit(shown.y, shown.height, sight.y, sight.height) / scale;
    return { ...hold, scale, x, y };
}

/** How far a span must slide to sit inside another; centred when it is the larger. */
function fit(start, length, within, room) {
    if (length >= room) return within + (room - length) / 2 - start;
    if (start < within) return within - start;
    if (start + length > within + room) return within + room - start - length;
    return 0;
}

/** A rect through a matrix that only scales and moves, as {x, y, width, height}. */
function rectOf(matrix, rect) {
    const a = matrix.transformPoint(new DOMPoint(rect.x ?? rect.left, rect.y ?? rect.top));
    const b = matrix.transformPoint(new DOMPoint((rect.x ?? rect.left) + rect.width, (rect.y ?? rect.top) + rect.height));
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

function grow(r, by) {
    return { x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by };
}

function union(a, b) {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

function inside(a, b) {
    return a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
}

function centreOf(element) {
    const box = element.getBoundingClientRect();
    return new DOMPoint(box.left + box.width / 2, box.top + box.height / 2);
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}
