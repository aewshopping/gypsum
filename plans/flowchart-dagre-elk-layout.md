# Plan: flowchart layout — dagre, then elk-like routing of our own

Status: **unbuilt.** Follows `plans/completed/flowchart-view.md`, which built the SVG, its
interactions and drawing links, all against placeholder positions.
Bump the manifest's minor version with each step that changes code.

The chart draws notes in a grid and links as straight lines (`services/flowchart/placeholder-layout.js`).
This plan replaces that with a real layout — where each box goes, the route each arrow takes, and where
each arrow's text sits — in two stages:

1. **dagre**, copied into the codebase as an ES module with its licence, places the boxes and the labels.
2. **elk-like routing, written here** — not elk itself, and not a port of it: the handful of elk's
   features we actually want, each built on top of dagre's placement as far as is practical.

**The look to aim for** is mermaid's own drawing of a chart like ours: `plans/reference/flowchart-layout-mockup.mmd`
holds the source, and the mermaid.live link at its top draws it — top to bottom, rounded boxes, text on
the arrows.

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

## Step 1 — widen the contract

- **Edges in carry their label's size**: `{from, to, label: {width, height} | null}`. `render-svg.js`
  already measures them; it passes them in instead of only drawing them.
- **Routes out carry what the drawing needs for steps 3–6**: the polyline as now, plus — added as each
  step needs it — which side of each box an arrow leaves and enters, and where it crosses another arrow.
- The placeholder fills the new fields in its simple way. Nothing in drawing, hover, press or drag
  changes; the level 2 flowchart spec runs unchanged.

## Step 2 — dagre

- Copy `dagre.esm.js` into `public/js/services/flowchart/` with its licence file.
- `services/flowchart/dagre-layout.js`: pure, the contract on top of dagre — box centres converted to the
  contract's top-left, edge points and label positions passed through. Labels go in with their sizes, so
  dagre keeps them clear of the boxes.
- **Top to bottom**, as the mockup is. Spacing starts at mermaid's defaults.
- **Stubs** take part like any node. **Notes with no links** sit wherever dagre puts them (its first
  rank); revisit only if a real chart shows it to be wrong.
- **Tests**: a node test of the adapter (`appModule`, no browser) — boxes never overlap, no label lands
  on a box, the same input gives the same output. Screenshots of a real folder for the look.

From here on, dagre still decides **where the boxes go and in what order**; steps 3–6 replace how the
arrows are drawn between them.

## Step 3 — (a) right-angled arrows with rounded corners

Every arrow is made of straight segments running north–south or east–west, and turns with a rounded
corner.

- **Routing** (`services/flowchart/orthogonal-routes.js`, pure): an arrow leaves the bottom of its source
  and enters the top of its target; between ranks it runs down, across in the gap between the two rows
  of boxes, and down again. An arrow that goes back up the chart — a cycle, which notes linking to each
  other always make — leaves by a side and travels up a channel beside the boxes, never through one.
- **Corners** are a drawing concern: the route stays a list of points, and `draw-flowchart-edge.js`
  turns each bend into a short arc of a fixed radius, smaller where two bends are close together.
- **Labels** sit on the arrow's longest vertical segment, centred, and are checked against boxes and
  other labels.

## Step 4 — (b) fewer crossings

- dagre already orders each row of boxes to keep crossings down; step 3 must not undo that.
- What routing adds: in each gap between rows, the horizontal runs are given **tracks** — separate
  heights — ordered so that runs which would cross can avoid it where an order exists that allows it.
- Measured as a count of crossings on a few real folders before and after, not judged by eye alone.

## Step 5 — (c) bridges where arrows cross

Where two arrows must cross, one hops over the other with a small arc, so neither reads as a turn.

- **Finding crossings** (`services/flowchart/line-jumps.js`, pure): with right-angled routes, a crossing
  is always a horizontal segment meeting a vertical one, so it is a simple test per pair of segments.
- **One rule decides who hops**: the horizontal segment hops over the vertical one. The hop is drawn into
  the path by `draw-flowchart-edge.js`; the arrow underneath is drawn unbroken.
- Hover still thickens the whole arrow, hop included.

## Step 6 — (d) separate arrows by default, merging as an option

- **Default: every arrow is its own line.** Where several arrows leave or enter the same side of a box,
  each gets its own **port** — attachment points spread along that side, with a gap between neighbours —
  so no two arrows share a segment.
- **Option: merge.** Arrows into the same box join into one trunk before it, entering at a single point
  (and, likewise, arrows out of one box share a trunk before they split). A flowchart option, stored with
  the others in the `flowchart` object of `.gypsum/table_layouts.gypsum` and written only through
  `setFlowchartOption()`; off unless chosen.
- With merging on, each arrow's text stays on its own branch, never on the shared trunk, so a label still
  says which link it belongs to.

---

## Open questions

1. **Corner radius and bridge size** — fixed in drawing units, so they zoom with the chart? (Assumed yes.)
2. **Which arrow hops** — always the horizontal one (assumed), or the one drawn later?
3. **Direction** — top to bottom only, as the mockup, or a left-to-right option later?
4. **Box positions remembered** — a real layout can move boxes when a link is added. Keeping them stable,
   or moving a box by hand, is a separate and larger feature; out of scope unless the movement proves
   disorienting.

---

## Where the code goes

| Path | |
|---|---|
| `public/js/services/flowchart/placeholder-layout.js` | stays — the contract's statement, and the fallback |
| `public/js/services/flowchart/dagre.esm.js` (+ licence) | step 2 — copied in |
| `public/js/services/flowchart/dagre-layout.js` | step 2 — the contract on top of dagre; pure |
| `public/js/services/flowchart/orthogonal-routes.js` | steps 3, 4, 6 — right-angled routes, tracks, ports; pure |
| `public/js/services/flowchart/line-jumps.js` | step 5 — where routes cross; pure |
| `public/js/ui/ui-functions-flowchart/draw-flowchart-edge.js` | steps 3, 5 — rounded corners and hops drawn into the path |
| `public/js/ui/ui-functions-flowchart/render-svg.js` | step 1 — hands label sizes in |
| `plans/reference/flowchart-layout-mockup.mmd` | the look aimed at |
