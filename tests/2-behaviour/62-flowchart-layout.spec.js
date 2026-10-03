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
 * @param {Object<string, string>} [groups] - key to the subgraph it is in; absent for none.
 */
const fixture = (keys, links, groups = {}) => ({
  boxes: keys.map(key => ({ key, ...BOX, group: groups[key] ?? '' })),
  edges: links.map(([from, to, text]) => ({ from, to, label: text ? label(text) : null })),
});

/** The chart in plans/reference/flowchart-layout-mockup.png: six notes, eight links, two cycles. */
const MOCKUP_NOTES = ['006', '004', '001', '005', '003', '002'];
const MOCKUP_LINKS = [
  ['004', '003', 'try to fix robot'],
  ['001', '002', 'other presents first'],
  ['001', '003', 'try to fix'],
  ['005', '003', 'try to fix robot'],
  ['003', '005', 'open chest panel'],
  ['003', '006', 'press silver button'],
  ['003', '004', 'screwdriver in belly button'],
  ['002', '003', 'try to fix the robot'],
];
const MOCKUP = fixture(MOCKUP_NOTES, MOCKUP_LINKS);

// Each one makes a single awkward case.
const CASES = {
  mockup: MOCKUP,
  'a link to itself': fixture(['a', 'b'], [['a', 'a', 'again'], ['a', 'b']]),
  'two links between the same notes': fixture(['a', 'b'], [['a', 'b', 'first'], ['a', 'b', 'second'], ['b', 'a']]),
  'a link spanning two rows': fixture(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['a', 'c', 'the long way']]),
  'notes with no links': fixture(['a', 'b', 'c'], []),
  // The mockup in two subgraphs and one note outside both, linked back and forth across the borders.
  'the mockup in groups': fixture(MOCKUP_NOTES, MOCKUP_LINKS,
    { '001': 'birthday', '002': 'birthday', '003': 'robot', '004': 'robot', '005': 'robot' }),
  'two groups linked across their borders, and a link to itself in one': fixture(['a', 'b', 'c', 'd', 'e', 'f'], [
    ['a', 'b', 'over'], ['b', 'c', 'back'], ['c', 'd'], ['d', 'e', 'over again'], ['a', 'e'], ['f', 'a', 'in'],
    ['e', 'a', 'up'], ['c', 'c', 'round'],
  ], { a: 'one', c: 'one', e: 'one', b: 'two', d: 'two' }),
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

  // Each group holds its own members and nothing else; groups do not overlap; and nothing at all
  // lands in the strip along a group's top edge, where its name is drawn.
  const groupNames = [...new Set(boxes.map(box => box.group).filter(Boolean))];
  expect(layout.groups.map(group => group.name)).toEqual(groupNames);
  const contains = (g, b) => b.x >= g.x && b.y >= g.y && b.x + b.width <= g.x + g.width && b.y + b.height <= g.y + g.height;
  layout.groups.forEach((group, i) => {
    boxes.forEach((box, j) => {
      if (box.group === group.name) expect(contains(group, placed[j]), `${box.key} inside ${group.name}`).toBe(true);
      else expect(overlaps(group, placed[j]), `${box.key} outside ${group.name}`).toBe(false);
    });
    layout.groups.slice(i + 1).forEach(other => expect(overlaps(group, other), `${group.name} overlaps ${other.name}`).toBe(false));
    const nameStrip = { x: group.x, y: group.y, width: group.width, height: GROUP_NAME_HEIGHT };
    [...placed, ...labels].forEach(b => expect(overlaps(nameStrip, b), `something lands on ${group.name}'s name`).toBe(false));
  });

  const inside = (x, y) => x >= -0.01 && y >= -0.01 && x <= layout.width + 0.01 && y <= layout.height + 0.01;
  [...placed, ...labels, ...layout.groups].forEach(b => {
    expect(inside(b.x, b.y) && inside(b.x + b.width, b.y + b.height), 'inside the drawing').toBe(true);
  });
  layout.routes.forEach(route => route.points.forEach(([x, y]) => expect(inside(x, y), 'route inside the drawing').toBe(true)));
}

const dagreLayout = async () => (await appModule('services/flowchart/layout/dagre-layout.js')).dagreLayout;
let GROUP_NAME_HEIGHT;
test.beforeAll(async () => {
  ({ GROUP_NAME_HEIGHT } = await appModule('services/flowchart/layout/dagre-layout.js'));
});

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

test('dagre: the order notes and links arrive in changes nothing', async () => {
  const layout = await dagreLayout();
  const graph = CASES['two groups linked across their borders, and a link to itself in one'];
  const once = layout(graph.boxes, graph.edges);
  const order = graph.edges.map((edge, i) => i).reverse();
  const again = layout([...graph.boxes].reverse(), order.map(i => graph.edges[i]));
  expect([...again.positions].sort()).toEqual([...once.positions].sort());
  order.forEach((i, j) => expect(again.routes[j]).toEqual(once.routes[i]));
});

test('dagre: notes with no links sit in a block above the chart, a subgraph keeping its own', async () => {
  const graph = fixture(['a', 'b', 'c', 'lone1', 'lone2', 'kept'], [['a', 'b'], ['b', 'c']], { kept: 'g' });
  const { positions } = (await dagreLayout())(graph.boxes, graph.edges);
  const top = key => positions.get(key).y;
  for (const lone of ['lone1', 'lone2']) {
    for (const key of ['a', 'b', 'c', 'kept']) expect(top(lone) + BOX.height, `${lone} above ${key}`).toBeLessThan(top(key));
  }
});

test('dagre: a loop turns as few links upward as it can', async () => {
  // Two loops through one link, eat → start: turning that one round breaks both.
  const graph = fixture(['chop', 'cook', 'eat', 'plan', 'shop', 'start', 'weed'], [
    ['start', 'plan'], ['start', 'shop'], ['plan', 'chop'], ['plan', 'weed'], ['shop', 'cook'],
    ['chop', 'cook'], ['cook', 'eat'], ['weed', 'eat'], ['eat', 'start'],
  ]);
  const { positions } = (await dagreLayout())(graph.boxes, graph.edges);
  const upward = graph.edges.filter(edge => positions.get(edge.from).y > positions.get(edge.to).y);
  expect(upward.map(edge => `${edge.from}→${edge.to}`)).toEqual(['eat→start']);
});

test('dagre: the mockup is drawn top to bottom, each link from its row to a lower one or back up', async () => {
  const { positions } = (await dagreLayout())(MOCKUP.boxes, MOCKUP.edges);
  const y = key => positions.get(key).y;
  // 001 links down to 002 and 003, and 002 down to 003, so they are three rows in that order.
  expect(y('001')).toBeLessThan(y('002'));
  expect(y('002')).toBeLessThan(y('003'));
  expect(y('003')).toBeLessThan(y('006'));
  // 003 ↔ 004 and 003 ↔ 005 are loops; as in the mockup, 003 is above both.
  expect(y('003')).toBeLessThan(y('004'));
  expect(y('003')).toBeLessThan(y('005'));
});

test('dagre: no boxes at all is an empty drawing', async () => {
  expect((await dagreLayout())([], [])).toEqual({ positions: new Map(), routes: [], groups: [], width: 0, height: 0 });
});

test('placeholder: keeps the contract too, as the fallback', async () => {
  const { placeholderLayout } = await appModule('services/flowchart/layout/placeholder-layout.js');
  const graph = CASES['notes with no links'];
  checkLayout(graph, placeholderLayout(graph.boxes, graph.edges, 96));
});
