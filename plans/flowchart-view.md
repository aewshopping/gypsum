# Plan: the flowchart view

Status: **steps 1–5 are built** (manifest `1.358.0`), on top of the mermaid code block and the
flowchart options. Step 6 is unbuilt.
Branch: `claude/flowchart-svg-first-plan`. Bump the manifest's minor version with each step that
changes code.

The view draws the current page's notes as an SVG map of the links between them: one box per note, one
arrow per link. Clicking a box opens the note; dragging from a box makes a link, or a new linked note.

**The order is UI first, layout last.** The look and the behaviour of the SVG are built and tested
against placeholder positions — a plain grid — and only once they are right does anything decide where
a note really goes. The mermaid source and the SVG are not connected while that happens, and the
connection may end up running the other way (the SVG as the primary thing, the mermaid text generated
from it). See *Later*.

---

## What already exists

- **The view and its code block** — `ui/render-file-list-flowchart.js` writes mermaid source into a
  contenteditable `<pre>`, from `services/flowchart/mermaid-source.js`.
- **The flowchart options** — five roles (node text, connectors, connector text, subgraph, node shape)
  in `FLOWCHART_ROLES` in `constants.js`, stored in the `flowchart` object of
  `.gypsum/table_layouts.gypsum`. Read with `flowchartProperty(role)` and written only by
  `setFlowchartOption()`, both in `services/flowchart/flowchart-options.js`. `nodeShapeFor()` maps a value to a
  shape in `NODE_SHAPES`. The SVG reads these exactly as the mermaid source does.
- **Reading links out of a property** — `toList()` and `linkTarget()` in
  `services/internal-links/link-targets.js`, so a connector item may be `cave.md` or `"[[cave.md]]"`.
- **The control row** — `ui-functions-flowchart/render-flowchart-controls.js`, drawn into
  `#output-controls` with the options button.
- **No view transition for this view** — one condition in `a-render-all-files.js`.

---

## Step 1 — the SVG viewer, with notes at placeholder positions *(built)*

Get the rendering and the pan and zoom right before anything else.

**The pan / zoom code is ported, not written.** The source is the world map on
https://popularhistorybooks.com/posts/reviews/2024-02-27-review-one-fine-day/, copied verbatim into
`plans/reference/svg-pan-zoom-original.html`. It has been tested across desktop, mobile and browsers,
so its logic is taken **pretty much word for word**: the `<g>` wrapper that carries the transform
(iOS will not transform the svg root), the scale + translate pair, the range slider, wheel zoom,
mouse drag, one-finger pan, two-finger pinch with the touch cache, the boundary margins, reset, and
fullscreen.

**What matters is how it behaves and how the controls sit over the SVG**: fullscreen and the pan-zoom
toggle as icon buttons at the top right, the reset button and zoom slider along the bottom, all
half-faded until hovered. Use the app's own icons (`<symbol>`s in `index.html`) and colours (its custom
properties) rather than the map's.

**One new module, as stand-alone as possible** — `public/js/svg-pan-zoom/svg-pan-zoom.js` exporting
something like `attachPanZoom(container)`. It knows nothing about notes, flowcharts or `appState`,
because it may later become a custom element for SVGs people put in their own notes. Its CSS is its
own file, `public/css/svg-pan-zoom.css`. It attaches its own listeners to its own elements — the
deliberate exception to the `data-action` rule, for that same reason.

The only changes from the original are the ones a module forces, and the bugs it carries:

- **Element look-ups by id become look-ups inside the container passed in**, and the implicit global
  `mapcontainer` becomes that container. Ids would collide with a second instance.
- **`makeDraggable` is called by `attachPanZoom`**, not by an inline `onload`.
- **`panzoomstate` must be declared at module scope.** The original assigns it undeclared inside
  `toggleFullscreen`, which works in a script and throws in a module (modules are strict).
- **`tpCache = []` reassigns a `const`** and throws when a pinch loses its starting touches. Use
  `tpCache.length = 0`.
- Drop the map-only parts: the country hover box, `txtshow`, `updateinfo`.
- **The pan-zoom toggle gates the mouse as well as touch** — drop `|| evt.type==="mousedown"` from
  `startDrag`. See below.

**The pan-zoom toggle is a mode switch, for mouse and touch alike.** The original let a mouse always
drag to pan and gated only the wheel and the finger. Here:

- **On — moving the chart.** A drag (mouse or finger) pans, the wheel and a pinch zoom. Nothing
  drags out of a note box, and a press on one opens nothing — the modes stay separate.
- **Off — working on the notes.** A finger scrolls the page past the chart and the wheel scrolls the
  page, as in the original. A press on a box opens it (step 3) and a drag from a box makes a link
  (steps 5 and 6); a drag on empty space does nothing with a mouse and scrolls the page with a finger.

That is why the presses never collide: a pan and a drag from a note can no longer start from the same
press, so the ported code needs no guard for note boxes and the note code needs no "was that a pan?"
test. Fullscreen still switches pan on, as the original does, and puts it back on exit. The note boxes
carry `touch-action: none` so a finger drag from one is not taken as a page scroll while pan is off.

**Notes are drawn by the flowchart, not by the module.** `ui-functions-flowchart/render-svg.js` builds
the `<svg>` with `createElementNS`, one `<g data-file-id="…">` per note on the page holding a box and
its label (title for now), set with `textContent` so nothing needs escaping. Positions come from
`services/flowchart/placeholder-layout.js`, a pure function: notes in a grid, roughly square,
a small gap between boxes. It exists to test pan and zoom and is thrown away when layout arrives.

Box size and text: a fixed width, the label wrapped to it by measuring with a canvas
`measureText()` (proportional fonts make length a poor guess) and the box as tall as its lines. Get
this looking right here — it is the bit this step is for.

**Check by screenshot**, desktop and a phone-sized viewport: zoom by slider, wheel and pinch; pan by
mouse and by finger with the toggle on; page scroll and no pan with it off; reset; fullscreen. The transform
should survive a re-render of the view (closing the options dialog re-renders) — carry it across the
way `keep-cell-state.js` carries the table's scroll position.

**What building it settled** — beyond the above:

- **The viewBox starts at 0 0 and the notes are moved into it.** The ported code zooms about
  `transform-origin: 50% 50%`, which SVG measures from the user-space origin, not the viewBox's
  corner — a viewBox with a negative origin zoomed off-centre.
- **The viewBox is never smaller than the SVG on screen**, so five notes draw at their own size rather
  than swelling to fill the viewer. Many notes shrink to fit; zoom brings them back. 100% still shows
  every note on the page.
- **The zoom strip runs from the left**, reset first: the app's floating new-note button sits at the
  bottom right and covered the slider's end on a phone.
- **`icon-pan`** (four arrows) is a new symbol; `icon-drag` is a grip and read wrongly.
- **Each box carries `aria-label` with its whole label**, since the drawn lines may be cut short.
- **Simulated touches cannot test a pan**: CDP touch events report `screenX` as 0, and the ported
  code pans by `screenX`. Checked instead with synthetic `TouchEvent`s carrying it; real devices do.

## Step 2 — the code / chart toggle *(built, default: chart)*

A switch in the flowchart's control row between the mermaid code block and the SVG, styled and wired
like the html / text switch in the note modal (`render_toggle`, `toggle-render-text.js`,
`appState.editState`):

- `appState.flowchartView.showSvg` — `true` for the SVG, `false` for the code. Being in `appState`, the
  position is remembered across view switches for the session.
- `ui-functions-flowchart/toggle-flowchart-render.js` sets it from the checkbox and re-renders.
  `render-file-list-flowchart.js` reads it and draws one or the other.

## Step 3 — the options, and click to open *(built)*

- **Draw the current page's notes**, as every other view does (`checkFileOnPage`), with the usual
  pagination nav below.
- **The options decide what a box shows** *(built)*: node text and node shape through
  `services/flowchart/node-content.js` — `readRoles()`, `nodeLabel()`, `nodeShape()`, moved out of
  `mermaid-source.js` so the code view and the chart cannot disagree — and the note's `color` as
  its fill through `.color-dynamic`, as the cards do. Subgraphs wait for layout.
  - **All eight shapes** are drawn by `ui-functions-flowchart/node-shape.js`, each grown to fit its
    text. Circle and diamond wrap narrower and are sized from their widest line, since they grow both
    ways; the rest keep one width so a grid of them stays tidy. The placeholder grid centres each
    shape in its cell.
- **A press on a box opens the note in the file content modal, on `mouseup`** *(built)* — `mouseup`
  so that a drag can start from the same press in step 5. As built:
  - **`data-action="open-flowchart-note"`** on each box, through a new `mouseup` delegate and
    `mouseUpActionHandlers` map in `event-listeners-add.js` — the click and pointerdown delegates'
    pattern. Handler: `ui-functions-flowchart/flowchart-note-open.js`, opening through
    `handleOpenFileContent`.
  - **Only the box the press began on opens.** Without it, pressing on empty chart and letting go
    over a box opened it. A press in the chart is recorded in `appState.flowchartView.press`,
    through the pointerdown map: a box's own `open-flowchart-note`, a link's `open-flowchart-link`
    and the chart's `flowchart-press`. Step 5's drag marks the same record `moved`.
  - **Pan on is handled by CSS**: the boxes get `pointer-events: none`, so no press reaches them.
  - **The modal fades in and out, and is not asked to grow out of the box.** A view transition
    cannot capture a shape inside an SVG — and a fade suits a note whose box is in plain sight better
    than a sweep from off the page. So the handler passes no element to animate from, and the modal
    closes the way it opened: `openFileContent` remembers a fade-in, and `doClose` fades out
    (the history list's open does the same). Nothing in the modal's code names the flowchart.
  - **The viewer fills the window below it, by CSS alone**: while the chart is drawn
    (`body:has(.flowchart-viewer)`) the page is a flex column — body, main and `#output` pass the
    height left over down to the viewer, at least 300px — so the chart ends at the window's foot
    however the content above it changes (a filter removed, the panel opened, a resize). The SVG is
    pinned to its container with `position: absolute; inset: 0`, since a percentage height has
    nothing definite to resolve against in a flex-sized box. An earlier version measured the height
    in JS at each render, and left a gap whenever something above it moved afterwards.

**Stop here and test.**

## Step 4 — connectors *(built)*

As built — the plan below held, with these decisions:

- **The links are a graph, shared with the mermaid source.** `services/flowchart/flowchart-graph.js`
  turns the files into nodes (notes, then stubs) and edges (`{from, to, text, file}`); the mermaid
  source's edges are now written from it, unchanged, so the code view and the chart agree.
- **The layout is pluggable.** `placeholder-layout.js` states the contract any layout keeps: boxes
  (`{key, width, height}`) and edges (`{from, to}`) in; box positions, one route per edge
  (`{points, labelAt}`, a polyline ending where the arrowhead goes) and the drawing's size out. The
  drawing only paints what comes back, so a real engine replaces that one module. The placeholder
  routes straight, offsets A→B from B→A, and loops a note's link to itself over its box.
- **Three layers**: link lines under the boxes, link text over them, so a box never hides a label.
- **Hover marks three elements** — the line thickens, the text is outlined, and the note the link is
  written in wears its own hover outline (`.is-link-source`, the same rule as `:hover`). They are
  separate elements, so `flowchart-link-hover.js` moves the classes on mouseover, as the table's
  column hover does.
- **A press on the line or the text opens the note the link is written in**:
  `data-action="open-flowchart-link"`, through the same press and release handlers as a box.
- **Known placeholder weakness**: a link between two boxes with a third in line passes behind it,
  and its text lands on it. Layout's job, not this step's.

- **An arrow per link**, from the connectors property of each note (`toList()` + `linkTarget()`, the
  target resolved to a file as `mermaid-source.js` does). A straight line from box to box, clipped at
  the box edges, with an SVG `marker` arrowhead. A link to a note that is not drawn — on another page,
  filtered out, or not yet written — gets a faded stub box that does nothing when pressed. Looks do not matter yet;
  getting the arrows on the page does.
- **The link text sits in a small box at the arrow's midpoint**, read by index from the connector
  text property. A missing entry means no box.
- **A press on the link text opens the note that holds the link** — the arrow's source — same
  rule as a box. That is the easy way to edit a label, since the label may come from a
  property that cannot be written directly (`internalLinkText`).

## Step 5 — drag from a note to a note makes a link *(built)*

As built — the plan below held, with these decisions:

- **A dialog before anything is written** — the shared warning modal, listing each property and the
  item that will be added to it. Only "add link" writes; cancel and Escape write nothing.
- **The connectors role offers only what a drag can write to**: the user's own properties and its
  default, `internalLink`, written through flowChartLink. The options dialog filters it (`flowchart-options-list.js`); a choice already saved is kept in its select.
- **A drag writes the link and no link text** — `[[two.md]]`, into flowChartLink or the user's own
  connectors property. Text written by a drag could only be read back correctly in some arrangements
  of the options: a pipe's text reaches the chart through internalLinkText, which lines up with
  internalLink and not with a property of the user's own, and a separate text list is only in step
  if it already was. The person adds the text in the note, where they want it — a press on the
  arrow opens that note. (Built first with a `link text here` placeholder, then taken out.)
- **Always written as a list** (`editing/add-flowchart-link.js`, through `applyRawEdits` with
  `toYamlList`), whatever the property's type: a single value becomes a list. flowChartLink is typed a
  list in `FILE_PROPERTIES`. Links are named by path, as the note picker names them.
- **Refused with a reason in the report line, nothing written**: a link that already exists, and a
  connectors property the chart cannot write. A drag back to its own box, or onto empty chart, does
  nothing (empty chart is step 6).
- **One undo entry**, named `link to two.md added`. The undo list reaches it; Ctrl+Z and the undo
  buttons are the table's.
- **The drag**: past 6px (10px for a finger) a press from a box becomes a drag, a dashed line
  follows the pointer and the box under it is outlined (`flowchart-node-drag.js`).
- **Touch follows the pan and zoom original** (`plans/reference/svg-pan-zoom-original.html`): mouse
  and touch events on the chart's own `<svg>`, a touchmove cancelled only once the press is a drag,
  and never a touchstart or `touch-action`. A tap must reach the browser untouched, because every
  data-action in the chart opens on the mouse events it makes from one — an earlier attempt with
  `touch-action: none` on the boxes broke exactly that. A swipe anywhere but a box scrolls the page.
  Level 2 holds it, with simulated touches.
- `services/flowchart/plan-flowchart-link.js` is the pure plan; `ui-functions-flowchart/flowchart-link-add.js`
  asks and writes. Level 1: `tests/1-data/61-flowchart-link.spec.js`.

- **The gesture**, with pan off: press on a box, drag (mouse or finger), release on another box. A
  line follows the pointer while dragging. The note under the release point is found with `document.elementFromPoint()`
  (`changedTouches[0]` for a finger).
- **The write goes through `applyCellEdits`**, exactly as a table cell edit does — so it is a
  verified, span-preserving front matter splice, one undo takes it back, and the refresh redraws the
  chart.
- **Where the link goes depends on the connectors property:** appended to the user's own property it
  names, or — for `internalLink`, which the app fills and nothing can write — to a front matter list
  called **`flowChartLink`**, created if the note does not have it. `internalLink` collects links from
  the body and every property, so the new one simply joins it.
- A link that already exists draws no second arrow — `internalLink` keeps one entry per target — so
  say so in the report line rather than writing a duplicate.

## Step 6 — drag from a note to empty space makes a new linked note

- **Release over no box** means "create a new note, linked from the one the drag started on".
- **A dialog asks for the name and folder.** Reuse `#modal-file-options` — it already has the folder
  field with the `gypsum-folders` datalist, the filename field and an error slot — in a "new note"
  mode that hides delete and offers one create button. Name and folder are validated the way rename
  and move already validate them (`editing/rename-file.js`).
- **Then**: `createEmptyNote(folder, filename)` (`services/create-note.js`), and the link written into
  the starting note exactly as step 5 writes one — the link alone, no link text. If the node
  text property is writable (the default, `title`, is), the new note gets a placeholder value for it
  so its box reads as a placeholder rather than a filename.
- **The new note does not open.** It appears on the chart; pressing it opens it.

---

## Later

Not to be designed for now — listed so nothing above closes them off.

- **Layout.** Replace `placeholder-layout.js` with real positions. Options as measured before: dagre
  (48 KB, good layered layout, no edge merging, polyline routing) or a Sugiyama engine written here
  (~500 lines of small pure passes: break cycles, layers, dummies, crossings, placement, routing).
  elkjs (1.6 MB) is ruled out on size.
- **Which way the mermaid source runs.** Either the SVG is laid out from the source (so hand-edits
  count, and nodes need a `%% gypsum:<id> <path>` comment to know which note they are), or the SVG is
  primary and the source is generated from it for export. Decide once the SVG exists.
- **Subgraphs** in the SVG, from the existing subgraph role.
- **Graph checks** — notes nothing links to, notes that link nowhere, several roots — marked on the
  chart and counted in the report line. Never auto-fixed.
- **Moving a box by hand**, which needs somewhere to keep positions.

---

## Where the code goes

| Path | |
|---|---|
| `public/js/svg-pan-zoom/svg-pan-zoom.js` | step 1 — the ported viewer; knows nothing of notes |
| `public/css/svg-pan-zoom.css` | step 1 — the viewer's controls overlaid on the SVG |
| `public/js/services/flowchart/placeholder-layout.js` | steps 1, 4 — the layout contract, and a grid with straight routes; pure, temporary |
| `public/js/services/flowchart/flowchart-graph.js` | step 4 — notes, stubs and links as a graph, shared with the mermaid source |
| `public/js/services/flowchart/node-content.js` | step 3 — a note's label and shape from the options, shared with the mermaid source |
| `public/js/ui/ui-functions-flowchart/node-shape.js` | step 3 — the eight shapes as SVG outlines |
| `public/js/ui/ui-functions-flowchart/render-svg.js` | steps 1, 3, 4 — graph, measure, layout, draw in three layers |
| `public/js/ui/ui-functions-flowchart/draw-flowchart-node.js`, `draw-flowchart-edge.js` | step 4 — one node; one link's line and its text |
| `public/js/ui/ui-functions-flowchart/flowchart-link-hover.js` | step 4 — a hovered link's line, text and source note |
| `public/css/flowchart-edges.css` | step 4 — lines, arrowheads, link text |
| `public/js/ui/ui-functions-flowchart/toggle-flowchart-render.js` | step 2 |
| `public/js/ui/ui-functions-flowchart/flowchart-*.js` | steps 3–6 — one file per action, beside the flowchart's renderers |
| `public/js/ui/ui-functions-flowchart/node-drag.js` | steps 5–6 — the drag line and where it ends |
| `public/js/editing/add-flowchart-link.js` | steps 5–6 — which property gets the link, via `applyCellEdits` |
| `public/css/flowchart.css` | built — extend for boxes, arrows, labels |

**Tests**: the writes of steps 5 and 6 go in `tests/1-data/` (what lands in the note, `flowChartLink`
created and appended to, undo); the toggle, click-to-open and drags in `tests/2-behaviour/`.
