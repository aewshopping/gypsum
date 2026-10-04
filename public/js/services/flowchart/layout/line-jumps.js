/**
 * @file Where two routes cross, so the drawing can bridge one over the other. Pure: no DOM.
 *
 * Step 5 of plans/completed/flowchart-dagre-elk-layout.md. Routes are right-angled, so a crossing is always one
 * route's horizontal run meeting another's vertical one, and **the horizontal one hops**. A meeting
 * exactly at the end of either run is a corner or a shared port, not a crossing, and is left alone; so
 * is a run lying along another, which is a merged trunk.
 */

/**
 * The hops each route makes: points on its horizontal runs where another route's vertical run crosses.
 *
 * @param {{points: number[][]}[]} routes
 * @returns {number[][][]} One list of `[x, y]` per route, in the same order.
 */
export function routeHops(routes) {
    const runs = routes.map(route => route.points.slice(1).map((end, k) => [route.points[k], end]));
    const across = runs.map(list => list.filter(([a, b]) => Math.abs(a[1] - b[1]) < 0.01 && Math.abs(a[0] - b[0]) > 0.01));
    const down = runs.map(list => list.filter(([a, b]) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) > 0.01));

    return across.map((runsAcross, r) => {
        const hops = [];
        for (const [a, b] of runsAcross) {
            const y = a[1];
            const onRun = [];
            down.forEach((runsDown, other) => {
                if (other === r) return;
                for (const [c, d] of runsDown) {
                    const x = c[0];
                    if (inside(x, a[0], b[0]) && inside(y, c[1], d[1])) onRun.push([x, y]);
                }
            });
            // In the order the run meets them, not the order the other routes arrive in.
            hops.push(...onRun.sort((p, q) => (p[0] - q[0]) * Math.sign(b[0] - a[0])));
        }
        return hops;
    });
}

/** Whether v lies strictly between two ends, clear of both. */
function inside(v, end1, end2) {
    return v > Math.min(end1, end2) + 0.5 && v < Math.max(end1, end2) - 0.5;
}
