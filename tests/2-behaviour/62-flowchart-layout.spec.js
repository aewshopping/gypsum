const { test, expect } = require('@playwright/test');
const { appModule } = require('../helpers');

/**
 * The flowchart's layout, on its own: plans/flowchart-dagre-elk-layout.md.
 *
 * Every layout module is pure, so these run in node with no browser. They share one invariant checker
 * and one set of fixtures, and each stage of the plan is meant to add a line to the checker rather than
 * tests of its own — the picture a layout draws is judged by eye at the plan's pauses, and what can be
 * said about it in numbers is said here.
 */

const BOX = { width: 180, height: 64 };

/** A label's box, sized roughly as the canvas would measure it. */
const label = text => ({ width: text.length * 7 + 12, height: 22 });

/**
 * A graph literal as the layout is handed one: boxes in order, and edges with their label sizes.
 * @param {string[]} keys
 * @param {Array<[string, string, string?]>} links - from, to, and the link's text if it has one.
 */
const fixture = (keys, links) => ({
  boxes: keys.map(key => ({ key, ...BOX })),
  edges: links.map(([from, to, text]) => ({ from, to, label: text ? label(text) : null })),
});

/** The chart in plans/reference/flowchart-layout-mockup.png: six notes, eight links, two cycles. */
const MOCKUP = fixture(['006', '004', '001', '005', '003', '002'], [
  ['004', '003', 'try to fix robot'],
  ['001', '002', 'other presents first'],
  ['001', '003', 'try to fix'],
  ['005', '003', 'try to fix robot'],
  ['003', '005', 'open chest panel'],
  ['003', '006', 'press silver button'],
  ['003', '004', 'screwdriver in belly button'],
  ['002', '003', 'try to fix the robot'],
]);

// Each one makes a single awkward case.
const CASES = {
  mockup: MOCKUP,
  'a link to itself': fixture(['a', 'b'], [['a', 'a', 'again'], ['a', 'b']]),
  'two links between the same notes': fixture(['a', 'b'], [['a', 'b', 'first'], ['a', 'b', 'second'], ['b', 'a']]),
  'a link spanning two rows': fixture(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['a', 'c', 'the long way']]),
  'notes with no links': fixture(['a', 'b', 'c'], []),
};

const overlaps = (p, q) => p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;

/** How far a point is from a box's edge: 0 on it, positive outside or inside. */
const offEdge = ([x, y], b) => {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.width));
  const dy = Math.max(b.y - y, 0, y - (b.y + b.height));
  if (dx || dy) return Math.hypot(dx, dy);
  return Math.min(x - b.x, b.x + b.width - x, y - b.y, b.y + b.height - y);
};

/**
 * Everything any layout must hold, whatever it draws: the boxes and labels it is handed, placed so
 * nothing overlaps, every route joining its own two boxes, and all of it inside the drawing.
 */
function checkLayout({ boxes, edges }, layout) {
  const placed = boxes.map(box => ({ key: box.key, ...layout.positions.get(box.key), width: box.width, height: box.height }));
  const labels = edges.flatMap((edge, i) => edge.label ? [{
    x: layout.routes[i].labelAt[0] - edge.label.width / 2, y: layout.routes[i].labelAt[1] - edge.label.height / 2,
    width: edge.label.width, height: edge.label.height, edge: i,
  }] : []);
  const byKey = new Map(placed.map(box => [box.key, box]));

  placed.forEach((p, i) => placed.slice(i + 1).forEach(q => expect(overlaps(p, q), `${p.key} overlaps ${q.key}`).toBe(false)));
  labels.forEach((l, i) => {
    placed.forEach(p => expect(overlaps(l, p), `label ${l.edge} lands on ${p.key}`).toBe(false));
    labels.slice(i + 1).forEach(m => expect(overlaps(l, m), `labels ${l.edge} and ${m.edge} overlap`).toBe(false));
  });

  expect(layout.routes).toHaveLength(edges.length);
  edges.forEach((edge, i) => {
    const { points } = layout.routes[i];
    expect(offEdge(points[0], byKey.get(edge.from)), `edge ${i} starts on ${edge.from}`).toBeLessThan(1);
    expect(offEdge(points.at(-1), byKey.get(edge.to)), `edge ${i} ends on ${edge.to}`).toBeLessThan(1);
  });

  const inside = (x, y) => x >= -0.01 && y >= -0.01 && x <= layout.width + 0.01 && y <= layout.height + 0.01;
  [...placed, ...labels].forEach(b => {
    expect(inside(b.x, b.y) && inside(b.x + b.width, b.y + b.height), 'inside the drawing').toBe(true);
  });
  layout.routes.forEach(route => route.points.forEach(([x, y]) => expect(inside(x, y), 'route inside the drawing').toBe(true)));
}

const dagreLayout = async () => (await appModule('services/flowchart/layout/dagre-layout.js')).dagreLayout;

for (const [name, graph] of Object.entries(CASES)) {
  test(`dagre: ${name} — nothing overlaps, every route joins its own boxes`, async () => {
    const layout = (await dagreLayout())(graph.boxes, graph.edges);
    checkLayout(graph, layout);
  });
}

test('dagre: the same graph gives the same picture every time', async () => {
  const layout = await dagreLayout();
  const once = layout(MOCKUP.boxes, MOCKUP.edges), again = layout(MOCKUP.boxes, MOCKUP.edges);
  expect(JSON.stringify([...again.positions], null, 0)).toBe(JSON.stringify([...once.positions], null, 0));
  expect(again.routes).toEqual(once.routes);
});

test('dagre: the mockup is drawn top to bottom, each link from its row to a lower one or back up', async () => {
  const { positions } = (await dagreLayout())(MOCKUP.boxes, MOCKUP.edges);
  const y = key => positions.get(key).y;
  // 001 links down to 002 and 003, and 002 down to 003, so they are three rows in that order.
  expect(y('001')).toBeLessThan(y('002'));
  expect(y('002')).toBeLessThan(y('003'));
  expect(y('003')).toBeLessThan(y('006'));
});

test('dagre: no boxes at all is an empty drawing', async () => {
  expect((await dagreLayout())([], [])).toEqual({ positions: new Map(), routes: [], width: 0, height: 0 });
});

test('placeholder: keeps the contract too, as the fallback', async () => {
  const { placeholderLayout } = await appModule('services/flowchart/layout/placeholder-layout.js');
  const graph = CASES['notes with no links'];
  checkLayout(graph, placeholderLayout(graph.boxes, graph.edges, 96));
});
