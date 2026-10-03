# Plan: flowchart layout with dagre and elk

Status: **unbuilt — for discussion.** Follows `plans/completed/flowchart-view.md`, which built the SVG,
its interactions and drawing links, all against placeholder positions.
Bump the manifest's minor version with each step that changes code.

The chart draws notes in a grid and links as straight lines (`services/flowchart/placeholder-layout.js`).
This plan replaces that with a real layout: where each box goes, the route each arrow takes, and where
each arrow's text sits — so links run one way down the page, cross as little as possible, and no text
lands on a box or on another label.

---

## What already exists

- **The layout contract** — the one thing the drawing code knows about layout, written at the top of
  `placeholder-layout.js`:
  - in: `boxes` (`{key, width, height}` per node, notes and stubs alike) and `edges` (`{from, to}`, node keys);
  - out: `positions` (Map of key → top-left `{x, y}`), `routes` (one per edge, same order:
    `{points: [x, y][], labelAt: [x, y]}`), and the drawing's `width` and `height`.
- **Measuring before layout** — `render-svg.js` wraps every node label and edge label on a canvas
  (`wrap-label.js`) and outlines every shape (`node-shape.js`) *before* calling the layout, so exact
  sizes are already known. Labels are measured but not handed in: the placeholder puts them at a
  route's midpoint.
- **Drawing in three layers** — lines, then boxes, then labels. A route is drawn as a polyline ending
  in the arrowhead. Self-loops and reversed pairs are special-cased in the placeholder.
- **The graph** — `flowchart-graph.js`: notes in page order, then stubs; edges in link order.
- **Only the current page is drawn**, so a layout handles tens of nodes, not thousands.
- **The mermaid code view** — mermaid itself lays charts out with dagre by default and elk as an
  option, so whichever we choose, the code view pasted into mermaid draws the same family of layout.

---

## Constraints

- **No runtime dependency from the network.** A library is a local file, vendored as
  `marked.eos.js` is (`public/js/services/`), with its licence notice kept.
- **No build step.** It has to load as an ES module in the browser as served; esbuild only bundles for
  the single-file release.
- **The contract stays the seam.** Drawing, hover, press, drag and the link-writing code must not
  change for a new engine. Anything a better layout needs (label sizes in, label positions out, bend
  points) is added to the contract, and the placeholder is kept conforming as the fallback.
- **Deterministic.** The same notes in the same order give the same picture, every render — a box
  must not jump because a cell elsewhere was edited.

---

## The options, measured

| | dagre (`@dagrejs/dagre`) | elk (`elkjs`) | Our own layered layout |
|---|---|---|---|
| Size | **49 KB** minified, 17 KB gzip | **1.6 MB** minified, 470 KB gzip | ~500 lines |
| Licence | MIT | EPL-2.0 or GPL-3.0 | ours |
| Form | ESM build shipped (`dist/dagre.esm.js`) | Java compiled to JS; `elk.bundled.js` or a Web Worker | n/a |
| API | **synchronous** | **async** (returns a Promise) | synchronous |
| Algorithm | layered (Sugiyama) | layered plus others (force, tree, …), very configurable | layered |
| Edge labels | placed as part of layout (`labelpos`, width/height in) | placed, with options for where | to write |
| Routing | polyline bend points | orthogonal, polyline or splines; ports | to write |
| Subgraphs | compound graphs (clusters) | hierarchical, well supported | to write |

For scale: all of gypsum's own JavaScript is 1.2 MB. elk alone would more than double what the app
loads, which is why the previous plan ruled it out; dagre adds about 4%.

---

## Recommendation

**dagre as the engine, behind the contract; elk only as an opt-in second engine, and only if dagre
falls short in a way we can name.**

- dagre does the job that matters — a layered chart with labels kept clear — at a size that costs
  nothing, synchronously, so `drawFlowchart` stays a plain function.
- elk's real advantages are orthogonal routing, ports and finer label control. If those are wanted,
  load elk **lazily with a dynamic `import()`** only when the user picks it, so nobody who does not
  choose it pays for 1.6 MB. That makes `drawFlowchart` async on that path — see step 4.
- Writing our own is the fallback if both prove wrong for this chart; it is not the first choice.

---

## Step 1 — widen the contract

Before any engine, make the contract carry what a real layout needs, and keep the placeholder honouring it.

- **Edges in carry their label's size**: `{from, to, label: {width, height} | null}`. `render-svg.js`
  already measures them; it passes them in instead of only drawing them.
- **Routes out may have bends**: `points` is already a polyline, so no change — but the drawing should
  be able to draw them smoothed. Decide: straight segments (what dagre returns), or a curve through the
  points (what mermaid draws).
- **Self-loops and reversed pairs** become the engine's business where it handles them, and the
  placeholder's special cases stay only inside the placeholder.
- Nothing in drawing, hover, press or drag changes. Tests: the existing level 2 flowchart spec, unchanged.

## Step 2 — dagre

- Vendor `dagre.esm.js` into `public/js/services/flowchart/` with its licence file.
- `services/flowchart/dagre-layout.js`: pure, takes the contract's input, returns its output. Box
  positions converted from dagre's centres to the contract's top-left; edge `points` and label `x, y`
  passed through.
- **Settings to choose**: direction (top-to-bottom or left-to-right), node and rank spacing, and the
  ranker. Start with mermaid's defaults so the chart looks like the code view would.
- **Notes with no links** still need a place: dagre puts disconnected nodes in the first rank. Decide
  whether they sit there or in a row beneath the connected part.
- **Stubs** take part like any node; a link into one is an edge like any other.
- **Tests**: level 1 is untouched (no file is written). A node test (`appModule`, no browser) of the
  adapter: boxes never overlap, every label is clear of every box, the same input gives the same
  output, and a self-loop and a reversed pair produce routes. Screenshots of a real folder for the look.

## Step 3 — direction and spacing as options

- **Direction** (top-down or left-right) is the one setting most likely to be wanted, and mermaid's
  source already has one. It would be a flowchart option, stored with the others in the `flowchart`
  object of `.gypsum/table_layouts.gypsum`, written only through `setFlowchartOption()`.
- Spacing is probably not worth exposing; fix it unless a real chart shows otherwise.

## Step 4 — elk, if wanted

Only after dagre has been used on real charts, and only for a named shortfall (labels still colliding,
a wish for right-angled arrows, or subgraphs dagre draws badly).

- **An engine option** — dagre or elk — in the options dialog. Choosing elk loads it with `import()`;
  the file is never fetched otherwise.
- **Async on that path**: `drawFlowchart` awaits the layout. The render must not let a later render's
  result be overwritten by an earlier, slower one, so the drawing checks it is still the current render
  before it writes the SVG.
- **Worker or not**: at one page of notes the main thread is fine; the worker build only if a layout
  is measured to block.
- **Service worker and single-file release**: the lazy file has to be cached by the service worker and
  inlined (or left out deliberately) by the release bundler. Check both before shipping.

## Step 5 — subgraphs (later)

The subgraph role already groups notes in the mermaid source. Both engines lay out clusters; drawing
them is a box behind each group. Not part of this plan unless steps 2–4 make it nearly free.

---

## Open questions

1. **Straight segments or curves** for routed arrows?
2. **Direction**: is top-down enough to start, or should the option come with step 2?
3. **Unlinked notes**: in the first rank, or gathered in a row of their own?
4. **elk at all?** Worth building step 4 speculatively, or wait until dagre has been tried on real charts?
5. **Box positions remembered?** A real layout can still move boxes when a link is added. Keeping
   positions stable across a change (or letting a box be moved by hand) is a separate, larger feature —
   out of scope here unless the movement turns out to be disorienting.

---

## Where the code goes

| Path | |
|---|---|
| `public/js/services/flowchart/placeholder-layout.js` | stays — the contract's statement, and the fallback |
| `public/js/services/flowchart/dagre.esm.js` (+ licence) | step 2 — vendored |
| `public/js/services/flowchart/dagre-layout.js` | step 2 — the contract on top of dagre; pure |
| `public/js/services/flowchart/elk-layout.js` | step 4 — the contract on top of elk; async, loaded on demand |
| `public/js/ui/ui-functions-flowchart/render-svg.js` | steps 1, 4 — hands label sizes in; awaits elk |
