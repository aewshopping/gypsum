const { test, expect } = require('@playwright/test');
const { appModule } = require('../helpers');

/**
 * The flowchart's layout, on its own: plans/completed/flowchart-dagre-elk-layout.md.
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
  // The mockup all in one subgraph, and a missing note outside it: no strip is empty top to bottom.
  'the mockup in one group': fixture([...MOCKUP_NOTES, 'gone'], [...MOCKUP_LINKS, ['006', 'gone'], ['006', 'gone', 'again']],
    Object.fromEntries(MOCKUP_NOTES.map(key => [key, 'part1']))),
  'two groups linked across their borders, and a link to itself in one': fixture(['a', 'b', 'c', 'd', 'e', 'f'], [
    ['a', 'b', 'over'], ['b', 'c', 'back'], ['c', 'd'], ['d', 'e', 'over again'], ['a', 'e'], ['f', 'a', 'in'],
    ['e', 'a', 'up'], ['c', 'c', 'round'],
  ], { a: 'one', c: 'one', e: 'one', b: 'two', d: 'two' }),
  // A long link from top to bottom with a group in the rows between, and links in and out of it.
  'a link passing a group by': fixture(['top', 'g1', 'g2', 'g3', 'bottom', 'side'], [
    ['top', 'bottom', 'the long way'], ['top', 'g1', 'in'], ['g1', 'g2'], ['g2', 'g3', 'on'], ['g3', 'bottom', 'out'],
    ['side', 'g2', 'from the side'], ['g3', 'top', 'back up'],
  ], { g1: 'middle', g2: 'middle', g3: 'middle' }),
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
  // Groups come in the order their first member's key sorts — the layout is blind to the input's order.
  const keyOrder = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const groupNames = [...new Set([...boxes].sort(keyOrder).map(box => box.group).filter(Boolean))];
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

/**
 * Everything stage 2's routing holds on top: every run horizontal or vertical; no run through a box;
 * no sideways run in a group's name strip; each label on a run of its own route; and a hop for every
 * crossing.
 */
function checkRoutes({ boxes, edges }, layout) {
  const placed = boxes.map(box => ({ key: box.key, ...layout.positions.get(box.key), width: box.width, height: box.height }));
  layout.routes.forEach((route, i) => {
    const runs = route.points.slice(1).map((end, k) => [route.points[k], end]);
    runs.forEach(([a, b], k) => {
      const straight = Math.abs(a[0] - b[0]) < 0.01 || Math.abs(a[1] - b[1]) < 0.01;
      expect(straight, `edge ${i} run ${k} is horizontal or vertical`).toBe(true);
      const run = { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(a[0] - b[0]), height: Math.abs(a[1] - b[1]) };
      placed.forEach(box => {
        const inner = { x: box.x + 0.5, y: box.y + 0.5, width: box.width - 1, height: box.height - 1 };
        const hit = run.x <= inner.x + inner.width && inner.x <= run.x + run.width && run.y <= inner.y + inner.height && inner.y <= run.y + run.height;
        expect(hit, `edge ${i} run ${k} goes through ${box.key}`).toBe(false);
      });
      if (Math.abs(a[1] - b[1]) < 0.01) layout.groups.forEach(group => {
        const inStrip = a[1] > group.y && a[1] < group.y + GROUP_NAME_HEIGHT
          && Math.max(a[0], b[0]) > group.x && Math.min(a[0], b[0]) < group.x + group.width;
        expect(inStrip, `edge ${i} runs across ${group.name}'s name`).toBe(false);
      });
    });
    if (edges[i].label && edges[i].from !== edges[i].to) {
      const [lx, ly] = route.labelAt;
      const onRun = runs.some(([a, b]) => lx >= Math.min(a[0], b[0]) - 0.01 && lx <= Math.max(a[0], b[0]) + 0.01
        && ly >= Math.min(a[1], b[1]) - 0.01 && ly <= Math.max(a[1], b[1]) + 0.01);
      expect(onRun, `edge ${i}'s label sits on a run of its own route`).toBe(true);
    }
  });
  expect(layout.routes.reduce((sum, route) => sum + route.hops.length, 0)).toBe(crossings(layout));

  // A route crosses a group's border only to reach or leave a member, and then once: never through a
  // group neither of its notes is in. Walked in small steps, counting each time it goes in or out.
  const groupOf = new Map(boxes.map(box => [box.key, box.group]));
  edges.forEach((edge, i) => {
    if (edge.from === edge.to) return;
    layout.groups.forEach(group => {
      const inside = ([x, y]) => x > group.x + 0.5 && x < group.x + group.width - 0.5 && y > group.y + 0.5 && y < group.y + group.height - 0.5;
      const points = layout.routes[i].points;
      let flips = 0, was = inside(points[0]);
      points.slice(1).forEach((end, k) => {
        const start = points[k], steps = Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / 2);
        for (let n = 1; n <= steps; n++) {
          const now = inside([start[0] + (end[0] - start[0]) * n / steps, start[1] + (end[1] - start[1]) * n / steps]);
          if (now !== was) flips++;
          was = now;
        }
      });
      const expected = (groupOf.get(edge.from) === group.name) !== (groupOf.get(edge.to) === group.name) ? 1 : 0;
      expect(flips, `edge ${i} (${edge.from}→${edge.to}) crosses ${group.name}'s border`).toBe(expected);
    });
  });
}

/** How many times one route's horizontal run crosses another's vertical one, clear of both ends. */
function crossings(layout) {
  const runs = layout.routes.map(route => route.points.slice(1).map((end, k) => [route.points[k], end]));
  const inside = (v, p, q) => v > Math.min(p, q) + 0.5 && v < Math.max(p, q) - 0.5;
  let count = 0;
  runs.forEach((mine, r) => mine.filter(([a, b]) => Math.abs(a[1] - b[1]) < 0.01).forEach(([a, b]) => {
    runs.forEach((theirs, o) => {
      if (o === r) return;
      theirs.filter(([c, d]) => Math.abs(c[0] - d[0]) < 0.01)
        .forEach(([c, d]) => { if (inside(c[0], a[0], b[0]) && inside(a[1], c[1], d[1])) count++; });
    });
  }));
  return count;
}

const dagreLayout = async () => (await appModule('services/flowchart/layout/dagre-layout.js')).dagreLayout;
let GROUP_NAME_HEIGHT;
test.beforeAll(async () => {
  ({ GROUP_NAME_HEIGHT } = await appModule('services/flowchart/layout/dagre-layout.js'));
});

const VARIANTS = { '': {}, 'left to right, ': { direction: 'LR' }, 'merged, ': { merge: true } };
for (const [variant, options] of Object.entries(VARIANTS)) {
  for (const [name, graph] of Object.entries(CASES)) {
    test(`dagre: ${variant}${name} — nothing overlaps, every route joins its own boxes`, async () => {
      const layout = (await dagreLayout())(graph.boxes, graph.edges, options);
      checkLayout(graph, layout);
      checkRoutes(graph, layout);
    });
  }
}

test('tracks: runs that do not overlap share a height, and overlapping ones do not', async () => {
  const { assignTracks } = await appModule('services/flowchart/layout/tracks.js');
  const tracks = assignTracks([
    { gap: 0, x1: 0, x2: 50, unit: 'a' }, { gap: 0, x1: 200, x2: 300, unit: 'b' },
    { gap: 0, x1: 20, x2: 100, unit: 'c' }, { gap: 1, x1: 20, x2: 100, unit: 'd' },
  ]);
  expect(tracks[0].index).not.toBe(tracks[2].index); // a and c overlap
  expect(tracks[1].index).toBe(0);                   // b overlaps nothing, so takes the top track
  expect(tracks[0].count).toBe(2);
  expect(tracks[3]).toEqual({ index: 0, count: 1 }); // another gap starts again
});

test('dagre: arrows divide a side evenly — two at its thirds, three at its quarters', async () => {
  const graph = fixture(['a', 'b', 'c', 'd', 'e'], [['a', 'b'], ['a', 'c'], ['b', 'e'], ['c', 'e'], ['d', 'e']]);
  const layout = (await dagreLayout())(graph.boxes, graph.edges);
  const along = (key, x) => (x - layout.positions.get(key).x) / BOX.width;
  const out = [0, 1].map(i => along('a', layout.routes[i].points[0][0])).sort();
  expect(out[0]).toBeCloseTo(1 / 3);
  expect(out[1]).toBeCloseTo(2 / 3);
  const into = [2, 3, 4].map(i => along('e', layout.routes[i].points.at(-1)[0])).sort();
  [1 / 4, 2 / 4, 3 / 4].forEach((share, n) => expect(into[n]).toBeCloseTo(share));
});

test('dagre: the mockup routes with no crossings, as the reference draws it', async () => {
  const layout = (await dagreLayout())(MOCKUP.boxes, MOCKUP.edges);
  expect(crossings(layout)).toBe(0);
});

test('dagre: left to right puts each link\'s rows side by side', async () => {
  const { positions } = (await dagreLayout())(MOCKUP.boxes, MOCKUP.edges, { direction: 'LR' });
  const x = key => positions.get(key).x;
  expect(x('001')).toBeLessThan(x('002'));
  expect(x('002')).toBeLessThan(x('003'));
  expect(x('003')).toBeLessThan(x('004'));
});

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
