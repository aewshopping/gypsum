# Plan: flowchart layout — dagre, then elk-like routing of our own

Status: **unbuilt.** Follows `plans/completed/flowchart-view.md`, which built the SVG, its
interactions and drawing links, all against placeholder positions.
Bump the manifest's minor version with each step that changes code.

The chart draws notes in a grid and links as straight lines (`services/flowchart/placeholder-layout.js`).
This plan replaces that with a real layout — where each box goes, the route each arrow takes, and where
each arrow's text sits — in three stages:

1. **dagre**, copied into the codebase as an ES module with its licence, places the boxes and the labels.
2. **elk-like routing, written here** — not elk itself, and not a port of it: the handful of elk's
   features we actually want, subgraphs among them, built on top of dagre's placement and free to
   adjust it where the routing needs room (see *Who has the last word*).
3. **Boxes stay where they are until a full re-render** — a note made by dragging to empty chart appears
   where it was dropped, and adding a link moves nothing; the layout tidies up only on a full re-render.

**Work stops after each stage for manual testing** — after step 2 (dagre), after step 7 (elk-like
routing and subgraphs) and after step 8 (positions held). The next stage starts only once the last has been tried.

**The look to aim for** is `plans/reference/flowchart-layout-mockup.png`: mermaid's drawing of a chart
like ours with its elk renderer, which is where stage 2 is headed. What it shows:

- top to bottom, rounded boxes, each arrow's text in a small box on the arrow;
- every arrow right-angled with rounded corners, leaving the bottom of its source and entering the top
  of its target — an arrow going back up the chart included (005 → 003, 004 → 003), which leaves its
  box's top and climbs to the underside of 003, rather than out of a side;
- **separate ports**: the three arrows out of 003's bottom and the two arrows into its underside each
  meet the box at their own point, and so do the two arrows into 003's top;
- each arrow's text on a vertical run of that arrow, between the rows of boxes;
- separate horizontal runs in the same gap at different heights (the tracks of step 4), so in this
  chart no two arrows cross.

---

## What already exists

- **The layout contract** — the one thing the drawing code knows about layout, written at the top of
  `placeholder-layout.js`:
  - in: `boxes` (`{key, width, height}` per node, notes and stubs alike) and `edges` (`{from, to}`, node keys);
  - out: `positions` (Map of key → top-left `{x, y}`), `routes` (one per edge, same order:
    `{points: [x, y][], labelAt: [x, y]}`), and the drawing's `width` and `height`.
- **Measuring before layout** — `render-svg.js` wraps every node label and edge label on a canvas
  (`wrap-label.js`) and outlines every shape (`node-shape.js`) *before* calling the layout, so exact
  sizes are known. Labels are measured but not yet handed in.
- **Drawing in three layers** — lines, then boxes, then labels; a route is drawn as a polyline ending in
  the arrowhead.
- **Only the current page is drawn**, so a layout handles tens of nodes, not thousands.

---

## Constraints

- **Copied in, never fetched.** A library is a local file, as `marked.eos.js` is, with its licence
  notice beside it.
- **No build step.** It loads as an ES module as served.
- **The contract stays the seam.** Drawing, hover, press, drag and the link-writing code do not change
  for a new layout. What a better layout needs is added to the contract, and the placeholder keeps
  conforming as the fallback.
- **Deterministic.** The same notes in the same order give the same picture on every render — a box
  must not jump because a cell elsewhere was edited.

---

## Why not elk itself

Measured from the current packages: **dagre** (`@dagrejs/dagre`, MIT) is 49 KB minified and ships an ES
module build (`dist/dagre.esm.js`); **elkjs** (EPL-2.0 or GPL-3.0) is 1.6 MB minified — more than all of
gypsum's own JavaScript (1.2 MB) — and only lays out asynchronously. What we want from elk is a few
features of its routing, which can be built over dagre's placement for far less.

---

## Stage 1 — dagre

### Step 1 — widen the contract

- **Edges in carry their label's size**: `{from, to, label: {width, height} | null}`. `render-svg.js`
  already measures them; it passes them in instead of only drawing them.
- **Routes out carry what the drawing needs for steps 3–7**: the polyline as now, plus — added as each
  step needs it — which side of each box an arrow leaves and enters, and where it crosses another arrow.
- The placeholder fills the new fields in its simple way. Nothing in drawing, hover, press or drag
  changes; the level 2 flowchart spec runs unchanged.

### Step 2 — dagre

- Copy `dagre.esm.js` into `public/js/services/flowchart/` with the package's `LICENSE` beside it, and
  the version in a comment at its top. As checked: `@dagrejs/dagre` 3.1.1, 48.5 KB, no imports
  (graphlib is bundled in), and it imports into node, so `appModule()` tests work. **It is minified** —
  the one source file nobody can read, as `marked.eos.js` already is. The `.map` files (~300 KB each)
  are not copied.
- **A multigraph, every edge named by its index.** `buildFlowchartGraph` keeps a note's two links to the
  same target as two edges; a plain graph merges them silently and `routes[i]` stops being edge *i*'s.
- **A link to itself**: dagre's points for one came back doubled back on themselves when tried. The
  placeholder's `loopRoute` is the fallback if they look wrong on screen.
- **Label sizes go in padded** — the 6 × 3 the drawn label box adds (`draw-flowchart-edge.js`) — or
  dagre leaves too little room for them.
- **Deterministic as checked**: the same graph twice gives identical points, and the file never calls
  `Math.random`. *Same order* is part of *same input*: a sort is a different picture, and a full render
  anyway.
- `services/flowchart/dagre-layout.js`: pure, the contract on top of dagre — box centres converted to the
  contract's top-left, edge points and label positions passed through. Labels go in with their sizes, so
  dagre keeps them clear of the boxes.
- **Top to bottom by default**, as the mockup is, **and left to right as an option** — see *Direction*
  below. Spacing starts at mermaid's defaults.
- **Stubs** take part like any node. **Notes with no links** sit wherever dagre puts them (its first
  rank); revisit only if a real chart shows it to be wrong.
- **Tests**: a node test of the adapter (`appModule`, no browser) — boxes never overlap, no label lands
  on a box, the same input gives the same output. Screenshots of a real folder for the look.

**Pause: stage 1 is tried by hand before stage 2 begins.**

---

## Stage 2 — elk-like routing

From here on, dagre's placement is where the routing **starts**, not the final word; steps 3–7 replace
how the arrows are drawn between the boxes, and may move the boxes to make room for them.

### Who has the last word

**Stage 2 is the refinement layer, and where it disagrees with dagre, stage 2 wins.** The open question
is how much it is allowed to change, because each power costs differently. The proposed line, to be
confirmed before step 3 is built:

- **Free**: moving labels; widening a gap — pushing every row below down, or every box beside one
  across — so tracks (step 4), ports (step 6) or a lane fit. That is stretching space, and everything
  dagre decided still holds in the stretched picture.
- **Free, as a hint only**: dagre's own bend points. dagre spaces each row around a lane for every arrow
  that passes through it and for every label, so its points say where a route *can* go without hitting a
  box. The router may use them or discard them; discarding one means finding or making a lane itself.
- **Not taken on lightly**: changing **which row** a box is in, or its **order** within the row. That
  is dagre's crossing reduction — the large, hard part of a layered layout — and redoing it is writing
  the layout rather than refining it. If a real chart shows it to be needed, it is a step of its own
  with its own measurement, not something the router does in passing.

Whatever the final line is, the step 2 node test (no box overlaps, no label on a box) runs again on the
router's output, since that is now the picture drawn.

### Step 3 — (a) right-angled arrows with rounded corners

Every arrow is made of straight segments running north–south or east–west, and turns with a rounded
corner.

- **Routing** (`services/flowchart/orthogonal-routes.js`, pure): an arrow leaves the bottom of its source
  and enters the top of its target; between ranks it runs down, across in the gap between the two rows
  of boxes, and down again. An arrow that goes back up the chart — a cycle, which notes linking to each
  other always make — does what the mockup does: 005 → 003 leaves its box's top and climbs into the
  underside of 003, in the gap between the rows, never through a box. An arrow that passes rows on the
  way runs in a lane through each (see *Who has the last word*).
- **Shapes that are not rectangles** — circle, diamond, hexagon. A route is worked out against the
  bounding box, which on a diamond leaves a line ending in empty space. Pragmatic, and to be settled
  here: an arrow **leaving** can start inside the box's outline — from its own port, so ports still
  spread — and the box, filled and drawn over the lines already, hides it until it emerges. An arrow
  **entering** cannot do the same, because its arrowhead would be hidden too: its last segment is cut
  where it meets the real outline (a vertical line against a polygon or a circle, a short calculation
  in `node-shape.js`, which already knows each outline).
- **Corners** are a drawing concern: the route stays a list of points, and `draw-flowchart-edge.js`
  turns each bend into a short arc, smaller where two bends are close together. The radius is in
  drawing units, so corners **grow and shrink with zoom** like everything else.
- **Labels** sit on the arrow's longest vertical segment, centred, and are checked against boxes and
  other labels.

### Step 4 — (b) fewer crossings

- dagre already orders each row of boxes to keep crossings down; step 3 must not undo that.
- What routing adds: in each gap between rows, the horizontal runs are given **tracks** — separate
  heights — ordered so that runs which would cross can avoid it where an order exists that allows it.
- **Tracks take height**, so a gap with many of them is widened and the rows below move down: the first
  use of the stretching *Who has the last word* allows.
- Measured as a count of crossings on a few real folders before and after, not judged by eye alone.

### Step 5 — (c) bridges where arrows cross

Where two arrows must cross, one hops over the other with a small arc, so neither reads as a turn.

- **Finding crossings** (`services/flowchart/line-jumps.js`, pure): with right-angled routes, a crossing
  is always a horizontal segment meeting a vertical one, so it is a simple test per pair of segments.
- **One rule decides who hops**: the horizontal segment hops over the vertical one. Two cases the rule
  does not cover need a tie-break: a crossing that lands exactly on a corner, and two horizontal runs on
  the same height (tracks should prevent it; the code must still not draw nonsense). The hop is drawn into
  the path by `draw-flowchart-edge.js`, in drawing units so it **zooms with the chart**; the arrow
  underneath is drawn unbroken.
- Hover still thickens the whole arrow, hop included.

### Step 6 — (d) separate arrows by default, merging as an option

- **Default: every arrow is its own line.** Where several arrows leave or enter the same side of a box,
  each gets its own **port** — attachment points spread along that side, with a gap between neighbours —
  so no two arrows share a segment.
- **Option: merge.** Arrows into the same box join into one trunk before it, entering at a single point
  (and, likewise, arrows out of one box share a trunk before they split). A layout setting — see
  *Layout settings* below; off unless chosen.
- With merging on, each arrow's text stays on its own branch, never on the shared trunk, so a label still
  says which link it belongs to. A branch can be too short to hold its text when neighbours are close;
  the gap is widened then, as for tracks.

### Step 7 — subgraphs

The subgraph option groups notes in the mermaid source today, and the SVG ignores it. It belongs here,
where the routing that would have to respect a group's border is being written.

- **dagre places the groups**: a compound graph, each group a parent node, so its members are kept
  together and dagre sizes a box round them.
- **The router keeps out of a group's border** except to cross it: an arrow between two notes in the
  same group stays inside, and one leaving the group crosses the border once.
- **Drawn as a box behind the notes**, with the group's name — under the lines layer, so nothing it
  holds is hidden.
- **The order matters as it does in the mermaid source**: mermaid puts a node in the first group it is
  mentioned in, and the SVG must agree with the code view, since both are drawn from
  `buildFlowchartGraph`. The group belongs in that graph, not worked out twice.
- What a stub (a note not drawn, or not yet made) belongs to is a question to answer when built — most
  simply, nothing.

---

**Pause: stage 2 is tried by hand before stage 3 begins.**

---

## Stage 3 — positions held until a full re-render

### Step 8 — a new note where it was dropped, and nothing moves for a link

A real layout recomputes every position each time it runs, so making a note or adding a link would
shuffle the whole chart under the person who just did it. Instead:

- **Positions are remembered** after each layout, in `appState.flowchartView` (box key → position, in
  drawing units).
- **A note made by dragging to empty chart takes the drop point** — the centre of the `+` stub that rode
  the drag, already worked out in drawing units by `flowchart-drag-ghost.js`.
- **Adding a link, by drag or in a note, moves no box.** Boxes that were already there keep their place,
  and only the arrows are routed again around them by stage 2's router, which takes fixed positions as
  readily as dagre's.
- **A full re-render lays everything out afresh** and forgets the held positions. Which renders count as
  full is to be confirmed when built: `renderFiles` already tells a full render (a filter, a sort, a page,
  a view switch, closing the options dialog) from the partial one a write's refresh runs, and the
  flowchart renderer has to be handed that difference rather than redrawing the same way for both.
- A held box can overlap another (a note dropped on a crowded spot); that lasts only until the next full
  re-render.
- **Tests**: level 2 — after a drag-made note and after an added link, every other box is exactly where
  it was; after a filter change, the layout is fresh.

### Things to think about before step 8

- **Holding positions is not enough to stop the picture moving.** `render-svg.js` centres the drawing in
  the viewBox (`translate((viewWidth - width) / 2 …)`) and recomputes the viewBox every render, and
  `readPanZoomState` restores zoom and pan in viewBox units. So a note dropped outside the drawing's
  bounds widens it, the centring changes, and every box moves on screen though none moved in the
  drawing. The centring offset and the viewBox have to be held too, or the stored positions taken to
  include them.
- **Keys change under a held position.** A position is held by box key, and a note created from a
  missing-note stub changes from `stub:<target>` to `note:<path>`; a note filtered out is a `stub:` box
  too. The stub's position should carry over to the note it becomes.
- **Which renders are full.** `renderFileList_flowchart` takes no `fullRender` today, so it has to be
  handed one. Changing an option role (connectors, node text) changes the graph itself and should count
  as full — it does already, being the close of the options dialog.
- **A box can change size where it stands.** An edit to the node text property re-measures the box;
  held boxes may then overlap or leave a gap, until the next full render. Accepted, but say so.

**Pause: stage 3 is tried by hand.**

---

## Direction: top to bottom, or left to right

To be built **in stages 1 and 2, as part of them, if it costs little** — and it should:

- **dagre**: one setting (`rankdir: 'TB'` or `'LR'`).
- **Stage 2's routing**: written in terms of *along the ranks* and *across them* rather than x and y, then
  turned into x and y at the end — so left to right is the same routing with the two axes swapped, and
  which side an arrow leaves (bottom, or right) follows from the same swap.
- **The option**: a layout setting, as merging is — see *Layout settings*.
- **Spacing is not symmetrical**: labels are wider than tall, so left to right needs a different gap
  between ranks. One more setting, still small.

If either stage shows this to be more than a small, contained change, it is dropped from that stage and
noted here instead.

---

## Layout settings

Direction and merging are not roles. `setFlowchartOption()` and `appState.flowchartOptions` are built
round *role → property name*: `LEGAL_ROLES` refuses any other key, the options dialog draws one property
select per role, and `follow-property-rename.js` renames whatever value matches a renamed property.
`'LR'` and `true` are a different kind of value and must not go through any of that.

- **A sibling object in the layouts file**, `flowchart.layout: {direction, merge}` (or a top-level key
  beside `flowchart` — decide when built), with its own small reader and one writer of its own, in the
  shape `flowchart-options.js` already has: an unknown value dropped rather than corrected, absent
  meaning the default.
- **`readLayouts()` must name it**, and `emptyDocument()` carry it, or it is dropped on the next write
  (see CLAUDE.md, *The flowchart's options*). `LAYOUT_VERSION` does not move: it is additive.

---

## Where the code goes

| Path | |
|---|---|
| `public/js/services/flowchart/placeholder-layout.js` | stays — the contract's statement, and the fallback |
| `public/js/services/flowchart/dagre.esm.js` (+ licence) | step 2 — copied in |
| `public/js/services/flowchart/dagre-layout.js` | step 2 — the contract on top of dagre; pure |
| `public/js/services/flowchart/orthogonal-routes.js` | steps 3, 4, 6, 7 — right-angled routes, tracks, ports, group borders; pure |
| `public/js/services/flowchart/line-jumps.js` | step 5 — where routes cross; pure |
| `public/js/ui/ui-functions-flowchart/draw-flowchart-edge.js` | steps 3, 5 — rounded corners and hops drawn into the path |
| `public/js/ui/ui-functions-flowchart/node-shape.js` | step 3 — where a line meets each shape's outline |
| `public/js/services/flowchart/flowchart-graph.js` | step 7 — each node's group |
| `public/js/ui/ui-functions-flowchart/render-svg.js` | steps 1, 7, 8 — hands label sizes in; group boxes; held positions |
| `public/js/ui/ui-functions-flowchart/flowchart-note-create.js` | step 8 — hands the drop point on to the new note |
| `plans/reference/flowchart-layout-mockup.png` | the look aimed at |
