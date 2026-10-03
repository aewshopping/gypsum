# Plan: flowchart layout — dagre, then elk-like routing of our own

Status: **stages 1 and 2 built (steps 1–7, direction and merging), stage 2 waiting to be tried by hand.** Follows `plans/completed/flowchart-view.md`, which built the SVG, its
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

**Work stops after each stage for manual testing** — after step 2b (dagre, with subgraphs), after
step 7 (elk-like routing) and after step 8 (positions held). The next stage starts only once the
last has been tried.

**The inspiration for the whole feature is [mermaid.live/edit](https://mermaid.live/edit)** — mermaid's own
editor, which draws a chart live from its source and can switch between its dagre and elk renderers.
When working out how a feature here should look or behave, open it, paste in a chart like ours and
inspect what it draws (with its elk renderer); it is the first place to look, before inventing an answer.

**Gypsum has one drawing style, and it is the elk-inspired one.** mermaid.live offering both renderers is
not a feature to copy: there is no dagre-or-elk switch here. dagre is only where stage 2 starts — what
places the boxes before the routing refines them — and stage 1's straight-from-dagre picture is a
stepping stone to be tried by hand, not a style anyone keeps.

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
- **Deterministic, and blind to the sort.** The same notes and links give the same picture on every
  render, whatever order they arrive in — a box must not jump because a cell elsewhere was edited.
  The files come in the table's sort, newest first by default, so editing a note would otherwise
  reorder the input and reshuffle the chart (decided after stage 1's first screenshots).

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

- Copy `dagre.esm.js` into `public/js/dagre/` with the package's `LICENSE` beside it, and
  the version in a comment at its top. As checked: `@dagrejs/dagre` 3.1.1, 48.5 KB, no imports
  (graphlib is bundled in), and it imports into node, so `appModule()` tests work. **It is minified** —
  the one source file nobody can read, as `marked.eos.js` already is. The `.map` files (~300 KB each)
  are not copied.
- **A multigraph, every edge named by its index.** `buildFlowchartGraph` keeps a note's two links to the
  same target as two edges; a plain graph merges them silently and `routes[i]` stops being edge *i*'s.
- **A link to itself — decided when built**: dagre 3.1.1's points for one are nowhere near its box. It
  is left out of the graph and drawn as the placeholder's `loopRoute` (the *k*th on a note reaching *k*
  times as far), and the room for it and its label is reserved by handing dagre the box grown to the
  right and upwards; the box goes back in the bottom-left of that space, and the other edges at it are
  ended on the real box with `edgeOfBox`.
- **Two links from one note to another are two arrows** when their texts differ: `internalLink` holds
  one entry per distinct link text (CLAUDE.md, *Front matter is data, not prose*), so
  `[[b|open the door]]` and `[[b|walk away]]` are two edges. A repeated mention with no text adds none.
- **Label sizes go in padded** — the 6 × 3 the drawn label box adds (`draw-flowchart-edge.js`) — or
  dagre leaves too little room for them.
- **Deterministic as checked**: the same graph twice gives identical points, and the file never calls
  `Math.random`. *Same order* is part of *same input*: a sort is a different picture, and a full render
  anyway.
- `services/flowchart/layout/dagre-layout.js`: pure, the contract on top of dagre — box centres converted to the
  contract's top-left, edge points and label positions passed through. Labels go in with their sizes, so
  dagre keeps them clear of the boxes.
- **Top to bottom by default**, as the mockup is, **and left to right as an option** — see *Direction*
  below. Spacing starts at mermaid's defaults.
- **Stubs** take part like any node.
- **Filename order, whatever the sort — decided when built.** dagre's picture depends on the order nodes
  and edges are added, so they are handed to it sorted by key (a note's key is its path, so 001, 002…
  come in their numbered order). The layout test holds that reversing the input changes nothing.
- **Which links point back up is ours — decided when built.** Where links make a loop one has to point
  up, and dagre picks by walking the nodes in the order added, which is arbitrary. `upward-links.js`
  walks the links depth-first from each note in turn and keeps the walk that turns the fewest round,
  ties going to filename order; those links go into dagre already turned, and their points are
  turned back. dagre's `greedy` option was tried first and did worse: it put 004 and 005 above 003 in
  the mockup, and turned two links up in a loop where one would do.
- **Notes with no links sit in a tidy block above the chart — decided when built.** Left to dagre they
  filled its first row and stretched the drawing. `unlinked-block.js` sets them in rows as wide as the
  chart (about square when there is none), each row centred, a rank's gap above it. A note in a
  subgraph stays in dagre, since its group needs it.
- **Tests**: a node test of the adapter (`appModule`, no browser) — boxes never overlap, no label lands
  on a box, the same input gives the same output. Screenshots of a real folder for the look.

### Step 2b — subgraphs placed by dagre

**Which group a note is in decides where it goes, so groups are placed here, in stage 1** — not left
for stage 2. Under *Who has the last word* stage 2 may stretch space but never moves a box to another
row or reorders one, so a step there would need exactly the power ruled out.

- **One dagre run, made compound** — each group a parent node, each member its child — **not one run
  per group.** Mermaid lays a subgraph out on its own only when no link crosses its border; ours are
  linked to each other, which is the point of the chart, and separate runs would leave every link
  between groups unplanned: no rank, no lane through the rows it passes, no crossing reduction. In one
  run dagre does all of that for links inside and between groups alike. The graph is only made
  compound when some note has a group, so a chart without subgraphs lays out exactly as before.
- **The group is in the graph**: `groupOf()` moved from `mermaid-source.js` into `flowchart-graph.js`,
  and every node carries `group` — so the code view and the chart cannot disagree. **A stub belongs to
  no group**: it stands for a link's far end, not a note drawn here. **Groups never nest**: the subgraph
  role reads one value per note, a list's first item.
- **The contract gains `group`** on each box in, and **`groups`** out — `{name, x, y, width, height}` in
  the order first met. The placeholder returns none.
- **The name sits in the strip dagre already leaves** inside a group's top edge — its border is a rank
  of its own — `GROUP_NAME_HEIGHT` (20) tall, cut to the box's width with an ellipsis. Nothing grows:
  the layout test holds that no box and no label lands in that strip.
- **Drawn first, under everything**, as a box with the name at its top-left
  (`draw-flowchart-group.js`, `flowchart-groups.css`), filled with the chart's background mixed a tenth of
  the way to the text colour — checked by screenshot in all three themes. It takes no presses, so a link dragged onto the
  space inside a group is still dropped on empty chart.
- **As built, a link's label can sit inside a group it only passes through** — dagre places labels on
  the link's own path, which may cross a group. Stage 2's routing, which keeps lines out of borders
  they do not need to cross (step 7), is where that is answered.

**Pause: stage 1 is tried by hand before stage 2 begins.**

---

## Stage 2 — elk-like routing

From here on, dagre's placement is where the routing **starts**, not the final word; steps 3–7 replace
how the arrows are drawn between the boxes, and may move the boxes to make room for them.

### Who has the last word

**Stage 2 is the refinement layer, and where it disagrees with dagre, stage 2 wins.** How much it is
allowed to change is decided, because each power costs differently:

- **Free**: moving labels; widening a gap — pushing every row below down, or every box beside one
  across — so tracks (step 4), ports (step 6) or a lane fit. That is stretching space, and everything
  dagre decided still holds in the stretched picture.
- **Free, added after stage 1**: **closing a gap** — sliding a box sideways along its row towards its
  neighbours, never past one, so its row and its order are kept. dagre's rows can come out wider than
  they need to be, mostly where the lanes it keeps for labels and long links have been left loose; once
  stage 2 has routed the lines its own way, it may take that space back. Where this goes among steps
  3–6 is decided when stage 2 is built.
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
- **The way out if this gets complicated: rectangles only.** If placing where lines leave or where
  arrowheads land on these shapes grows complicated, the preference is to stop offering non-rectangular
  shapes at all rather than carry the complication — to be judged when step 3 is built. That would mean
  taking circle, diamond and hexagon (and any other shape the router cannot treat as its box) out of
  `NODE_SHAPES`, which the option, the mermaid source and `node-shape.js` all read.
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

### Step 7 — routing round subgraphs

The groups are placed in step 2b; this is the routing that respects them.

- **The router keeps out of a group's border** except to cross it: an arrow between two notes in the
  same group stays inside, and one leaving the group crosses the border once.
- **A label goes on the part of its link outside any group it only passes through**, where there is one.
- The layout test gains the rule: a route crosses a group's border only where it enters or leaves a
  member, and only once each way.

---

### As built

What stage 2 turned out to be, where it settled something the steps above left open.

- **Routes run in dagre's lanes, and turn only in the gaps between rows.** dagre hands back one point
  for every row a link passes — a lane it has kept clear, the label's own row and a group's border rows
  among them — so a route goes straight down each lane and jogs sideways only between two rows. That
  is *Who has the last word*'s "dagre's bend points as a hint", taken all the way: since nothing in a
  row is ever crossed sideways, no route goes through a box, a label or a group's name.
- **Labels stay where dagre put them**, on the lane through their own row — not moved to "the longest
  vertical run" as step 3 first said. dagre already kept that place clear of every box and label, and
  the route passes through it, so the label is on its own line by construction.
- **Upward links** are the ones dagre-place.js turned round for dagre; they are routed down like any
  other and their points reversed, so 005 → 003 leaves 005's top and climbs into 003's underside, as the
  mockup does.
- **Tracks** (`TRACK_SPACING` 18) are spaced evenly in their gap; a gap with too little room is widened
  and every row below moves down. 18 rather than 12 because the last run is also where the arrowhead
  lands, and 12 left it cramped against a corner.
- **Bends along a row share a height — added after the first try by hand.** Jogs are ordered to cross
  as little as possible, then each goes on the highest track it can without lying along a jog above it
  in that order, so jogs that do not overlap side to side bend at the same height, as the reference
  picture's do. Two jogs that do not overlap cannot cross, so this loses nothing the order won.
- **Ports divide a side evenly, and that comes first — decided after the second try by hand.** One
  arrow meets a side at its middle, two at its thirds, three at its quarters, out or in, as in the
  reference picture: well clear of the corners and of each other. Over a rectangle's whole side, and
  over the middle of a diamond's or a circle's (`ports` in node-shape.js). A port does not move to save
  a bend, with one exception: a port a few units (`NUDGE`, 5) from the lane beside it moves onto it,
  since a step that small reads as a glitch and a port that far off its division is not visible. An
  earlier version put ports in line with their lanes; it made straighter lines and arrows bunched
  towards corners, and was dropped for this.
- **Fewer bends where a link can have them** (`straighten.js`). dagre often runs a long link's lane
  right along a box's edge, so the route jogged at each end. A link whose lanes form one straight
  column has the column, label and all, slid onto one of its ports — both, when they line up, so it
  runs straight — when nothing in its rows comes within 10 and no group edge is crossed. Ports never
  move for it. Not with merging on, whose trunks are their own alignment.
- **The arrowhead is 13 units, not 10**, and the last corner before it leaves it a straight run of its
  own length, so it never points along a curve (`edge-path.js`).
- **An arrowhead stops 7 short of its box; a line leaving a box starts on it** — after the third try by
  hand, widened from 4 after the fourth (`ARROW_GAP` in `edge-path.js`, so every shape gets it). The
  head is an equilateral triangle, 13 long and 2/√3 of that across.
- **A gap's margin is larger where an arrowhead lands on it** (`jog-heights.js`): 32 rather than 18,
  room for the head, its gap and a corner. Bends in a gap share their height, so the margin moves the
  bends of lines leaving the box beside it too, as asked; gaps grow where they need the room.
- **Boxes are narrower**: text wraps at 128 rather than 156, so a longer title takes two lines, as in
  the reference picture.
- **Closing gaps** is `compact-columns.js`, last before the unlinked block: a strip empty from the top
  of the drawing to the bottom is narrowed to 40, everything right of it moving left. So nothing changes
  order, no straight line gains a bend, and nothing comes closer to anything than 40.
- **Shapes stay.** The pragmatic fix worked: ports spread over only the part of a side a shape can take
  an arrow on (`ports` in node-shape.js), and `fit-routes-to-shapes.js` moves each end along its last
  run onto the real outline. The way out (rectangles only) was not needed.
- **Left to right is the top to bottom chart on its side** (`transpose.js`): boxes and labels go in
  turned, the picture is mirrored across its diagonal, and labels then sit on horizontal runs. A group's
  name gets a strip above the group, since the strip top to bottom keeps is, mirrored, its left side. The
  separate rank spacing step *Direction* expected was not needed: a turned label is as tall as its text
  is wide, so dagre already leaves room for it.
- **Merging** gives every arrow on a side one port at its middle — arrowheads and tails together, as
  mermaid's elk drawing does — and every jog meeting that port one track, so they join in one trunk
  that runs both ways: under 003 in the mockup one bus carries the arrows up into 003 and the lines
  out of it to 004, 005 and 006. A link jogging once goes with its arrowhead's side. A shared port is
  never nudged onto a lane, or the trunk would split. The mockup merged has no crossings.
- **Step 7 holds by construction**: dagre keeps lanes for links that are not a group's out of it, and
  routes only turn in gaps, so the layout test's rule — a route crosses a group's border only to reach
  or leave a member, and once — passed on every fixture without code of its own.
- **Measured**: the mockup routes with no crossings, as the reference does; the mixed chart in the look
  spec has one, bridged.

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

- **A top-level key in the layouts file, `flowchartLayout: {direction, merge}`**, beside `flowchart` —
  not inside it. The `flowchart` object is read entry by entry through `setFlowchartOption()`, which drops
  any key that is not a role, and written back from `appState.flowchartOptions` alone, so a `layout`
  nested in it would be lost on the first read and the first write. A key of its own is the
  `linkedProperties` precedent. Its own small reader and one writer
  (`services/flowchart/flowchart-layout-settings.js`), in the shape `flowchart-options.js` already has:
  an unknown value dropped rather than corrected, absent meaning the default.
- **Built with stage 2, not stage 1**: stage 1 is top to bottom only, and the settings, the direction
  and merging arrive together.
- **`readLayouts()` must name it**, and `emptyDocument()` carry it, or it is dropped on the next write
  (see CLAUDE.md, *The flowchart's options*). `LAYOUT_VERSION` does not move: it is additive.

---

## Testing

The suite runs on every change, so what this feature adds to it has to earn its place. The rule from
CLAUDE.md decides the level, and for this feature the answer is short.

### Level 1 — nothing new

Level 1 is for what can lose or corrupt a note. **Nothing in this plan writes a note**: layout decides
where boxes and lines go, and the drag-to-link and drag-to-create writes it draws on already exist and
are already guarded by `tests/1-data/61-flowchart-link.spec.js`. The layout settings write the layouts
file, which is a setting rather than a note, and by precedent is tested at level 2 (the flowchart roles
are, in `54-flowchart-options.spec.js`; the layouts themselves in `43-table-layouts.spec.js`).

One thing to do at level 1, once, at step 2: **`61-flowchart-link.spec.js` drags by fixed offsets** —
`centre[1] - 400` to mean "off the chart", `+200, +150` to mean "empty chart". Those assumed the grid.
When dagre moves the boxes, check each still means what it says, and where it does not, work the point
out from the drawn boxes rather than picking a new number.

### Level 2 — mostly node tests, which cost milliseconds

Every layout module is pure, so it is tested with `appModule()` in node — no browser, no page load. These
go in one new spec, **`tests/2-behaviour/62-flowchart-layout.spec.js`**, a new area, run while working
as `npm test tests/2-behaviour/62-flowchart-layout.spec.js`.

- **One invariant checker, written once and run on every stage's output**: no two boxes overlap, no
  label lands on a box or another label, every route starts at its source and ends at its target, and
  — from step 3 — every segment is horizontal or vertical and none passes through a box. It is a
  function in the spec, not app code. Each step adds a line to it rather than a test of its own.
- **Fixtures, not folders**: the mockup's chart as a graph literal (six notes, eight links, two cycles),
  plus a few small hand-written ones that each make one hard case — a link to itself, two links between
  the same notes, an arrow spanning two rows, a subgraph. The same fixtures go through every stage.
- **Determinism**: the same fixture laid out twice is identical — one assertion, on the mockup fixture.
- **Crossings are counted, not looked at**: step 4 asserts the mockup fixture has none, as the picture
  does.
- **Pure helpers get a test only where they are fiddly**: where a hop sits on a segment (step 5), where a
  line meets a diamond's outline (step 3), the held positions laid over a fresh layout (step 8). Rounded
  corners and the `d` string are looked at in the screenshots instead.

Browser tests are few, added to `54-flowchart-options.spec.js` where that area is already covered:

- the layout settings are written at once and read back (one test, as the roles have);
- step 8: after an added link and after a drag-made note every other box is where it was, and after a
  filter change the layout is fresh (two tests — the only behaviour here no node test can reach).

### Level 3 — the look

One spec, **`tests/3-occasional/62-flowchart-layout-look.spec.js`**, that draws the mockup's chart and takes a screenshot, run at each
pause for comparing against `plans/reference/flowchart-layout-mockup.png` — never asserting pixels, and
never on every run.

**While iterating**: level 1 plus `62-flowchart-layout.spec.js`; `54-flowchart-options.spec.js` when a
step touches the page; the whole suite once, at each pause.

---

## Where the code goes

The layout is a new concern inside the flowchart, so it gets **a folder of its own**: what the chart says
(`services/flowchart/`) stays apart from where it goes (`services/flowchart/layout/`). dagre gets its own
folder as svg-pan-zoom has — a library that knows nothing of notes, with its licence beside it.

| Path | |
|---|---|
| `public/js/dagre/dagre.esm.js`, `public/js/dagre/LICENSE` | step 2 — copied in, version noted at the top |
| `public/js/services/flowchart/layout/placeholder-layout.js` | moved here at step 2 — still the contract's statement, and the fallback |
| `public/js/services/flowchart/layout/dagre-layout.js` | step 2, then stage 2 — the contract: the steps in order, and nothing else; pure |
| `public/js/services/flowchart/layout/dagre-place.js` | step 2 — dagre's placement: boxes, groups, each link's lanes and label; pure |
| `public/js/services/flowchart/layout/ranks.js` | step 4 — the rows and the gaps between them, and widening a gap; pure |
| `public/js/services/flowchart/layout/compact-columns.js` | stage 2 — strips empty top to bottom, narrowed; pure |
| `public/js/services/flowchart/layout/transpose.js` | stage 2 — left to right, as top to bottom on its side; pure |
| `public/js/services/flowchart/layout/chart-frame.js` | stage 2 — the chart moved to 0 0, and name strips above groups left to right; pure |
| `public/js/services/flowchart/layout/upward-links.js` | step 2 — which links of a loop point back up; pure |
| `public/js/services/flowchart/layout/unlinked-block.js` | step 2 — notes with no links, in a block above the chart; pure |
| `public/js/services/flowchart/layout/orthogonal-routes.js` | step 3 — right-angled routes over dagre's placement; pure |
| `public/js/services/flowchart/layout/tracks.js` | step 4 — the order of the runs in each gap; pure |
| `public/js/services/flowchart/layout/jog-heights.js` | step 4 — each gap's margins and room, and the height each run takes; pure |
| `public/js/services/flowchart/layout/line-jumps.js` | step 5 — where routes cross; pure |
| `public/js/services/flowchart/layout/ports.js` | step 6 — where on a side each arrow meets a box, and merged trunks; pure |
| `public/js/services/flowchart/layout/straighten.js` | stage 2 — a straight link's lanes slid onto one of its ports; pure |
| `public/js/services/flowchart/layout/held-positions.js` | step 8 — held positions laid over a fresh layout; pure |
| `public/js/services/flowchart/flowchart-graph.js` | step 2b — each node's group, moved here from `mermaid-source.js` so the source and the SVG share one answer |
| `public/js/services/flowchart/flowchart-layout-settings.js` | stage 2 — direction and merging: the reader and the one writer |
| `public/js/table-layouts/layout-file.js` | stage 2 — `flowchartLayout` read, written, and in `emptyDocument()` |
| `public/js/ui/ui-functions-flowchart/edge-path.js` | steps 3, 5 — a route as a path `d`: rounded corners and hops; pure, split out of `draw-flowchart-edge.js` |
| `public/js/ui/ui-functions-flowchart/node-shape.js` | step 3 — the share of a side ports spread over, and where a line meets each outline |
| `public/js/ui/ui-functions-flowchart/fit-routes-to-shapes.js` | step 3 — each route's ends moved onto its boxes' outlines |
| `public/js/ui/ui-functions-flowchart/draw-flowchart-group.js` | step 2b — a subgraph's box and name |
| `public/js/ui/ui-functions-flowchart/render-svg.js` | steps 1, 2b, 3, 8 — label sizes in; groups drawn; arrows into a shape cut at its outline; held positions |
| `public/js/ui/ui-functions-flowchart/flowchart-options-list.js` | stage 2 — direction and merging in the options dialog, in the rows it already draws |
| `public/js/ui/ui-functions-flowchart/flowchart-note-create.js` | step 8 — hands the drop point on to the new note |
| `public/css/flowchart-groups.css` | step 2b — the subgraph box; a new component, so a new file |
| `plans/reference/flowchart-layout-mockup.png` | the look aimed at |

**Not duplicated, by decision:**

- **The layout never learns about shapes.** It routes against bounding boxes; `render-svg.js` cuts an
  arrow entering a non-rectangular shape at its outline, asking `node-shape.js`, which already owns every
  outline. So the services do not import from the UI, and there is one place that knows what a diamond
  is.
- **The label's padding is exported from `draw-flowchart-edge.js`** and used by `render-svg.js` to size
  what goes into the layout, not copied as a second pair of numbers.
- **The group a note is in is worked out once**, in `flowchart-graph.js`, and read by the mermaid source
  and the SVG alike — the same reason the graph itself is shared.
- **The options dialog gains rows, not a second dialog**, and its existing CSS styles them; the layout
  settings writer follows `flowchart-options.js`'s shape without sharing its code, because the values
  are of a different kind (see *Layout settings*).
- **`placeholder-layout.js`'s `edgeOfBox` is not reused for shapes**: it finds a rectangle's edge for a
  straight line from the centre, a different question from where a vertical line meets an outline.

**When a step lands**, CLAUDE.md's file map gains its rows and a short *Flowchart layout* section takes
the rules worth keeping — the contract, who has the last word, one style — and DATA-STRUCTURES.md the
held positions in `appState.flowchartView`.
