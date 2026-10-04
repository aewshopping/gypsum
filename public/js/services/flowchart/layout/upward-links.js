/**
 * @file Which links point back up the chart. Pure: no DOM.
 *
 * Where links make a loop one of them has to point up, and which one decides the whole picture: in
 * the mockup, 003 ↔ 004 could put either above the other. dagre makes that choice by walking the
 * notes in the order they were added, which is arbitrary here — so it is made here instead, and
 * dagre-layout.js hands dagre those links already turned round.
 *
 * The choice: walk the links depth-first, turning round each that leads back to a note still on the
 * walk, and do it from every note in turn as the first; keep the walk that turns the fewest, the
 * earliest key on a tie. So the arrows that point up are as few as this can find, and nothing about
 * the answer depends on the order the notes arrive in. A page holds tens of notes, so trying each is
 * cheap.
 */

/**
 * The links to turn round, by index.
 *
 * @param {string[]} keys - Every node, sorted.
 * @param {{from: string, to: string}[]} edges - Links between different nodes, with `i`, their index
 *   in the layout's edge list; sorted, so a walk takes them in a fixed order.
 * @returns {Set<number>} The `i` of each link that points up.
 */
export function upwardLinks(keys, edges) {
    const out = new Map(keys.map(key => [key, []]));
    edges.forEach(edge => out.get(edge.from).push(edge));

    let best = null;
    for (const first of keys) {
        const turned = walk([first, ...keys.filter(key => key !== first)], out);
        if (best === null || turned.size < best.size) best = turned;
    }
    return best ?? new Set();
}

/**
 * One depth-first walk, starting from each key in the order given that has not yet been reached.
 * @param {string[]} roots
 * @param {Map<string, object[]>} out - Each node's outgoing links.
 * @returns {Set<number>} The links that led back to a note still on the walk.
 */
function walk(roots, out) {
    const done = new Set(), onWalk = new Set(), turned = new Set();
    const visit = key => {
        done.add(key);
        onWalk.add(key);
        for (const edge of out.get(key)) {
            if (onWalk.has(edge.to)) turned.add(edge.i);
            else if (!done.has(edge.to)) visit(edge.to);
        }
        onWalk.delete(key);
    };
    roots.forEach(key => { if (!done.has(key)) visit(key); });
    return turned;
}
