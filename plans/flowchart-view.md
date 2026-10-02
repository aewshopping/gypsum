# Plan: the flowchart view

Status: **the mermaid code block and the flowchart options are built.** Everything from step 1 below
is unbuilt.
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
  `setFlowchartOption()`, both in `services/flowchart-options.js`. `nodeShapeFor()` maps a value to a
  shape in `NODE_SHAPES`. The SVG reads these exactly as the mermaid source does.
- **Reading links out of a property** — `toList()` and `linkTarget()` in
  `services/internal-links/link-targets.js`, so a connector item may be `cave.md` or `"[[cave.md]]"`.
- **The control row** — `ui-functions-flowchart/render-flowchart-controls.js`, drawn into
  `#output-controls` with the options button.
- **No view transition for this view** — one condition in `a-render-all-files.js`.

---

## Step 1 — the SVG viewer, with notes at placeholder positions

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

## Step 2 — the code / chart toggle

A switch in the flowchart's control row between the mermaid code block and the SVG, styled and wired
like the html / text switch in the note modal (`render_toggle`, `toggle-render-text.js`,
`appState.editState`):

- `appState.flowchartSvgState` — `true` for the SVG, `false` for the code. Being in `appState`, the
  position is remembered across view switches for the session.
- `ui-functions-click/toggle-flowchart-render.js` sets it from the checkbox and re-renders.
  `render-file-list-flowchart.js` reads it and draws one or the other.

## Step 3 — the options, and click to open

- **Draw the current page's notes**, as every other view does (`checkFileOnPage`), with the usual
  pagination nav below.
- **The options decide what a box shows**: node text from `flowchartProperty(NODE_TEXT)`, shape from
  `nodeShapeFor()` on the node shape property, and the note's `color` as its fill, as the cards do.
  Subgraphs wait for layout.
- **A press on a box opens the note in the file content modal, on `mouseup`** — `mouseup` so that a
  drag can start from the same press in step 5. Only while pan is off; a mouseup that is the end of
  a drag belongs to step 5, not to opening. Open through the existing path (`openFileContent` /
  `handleOpenFileContent` in `open-file-content-view-trans.js`) with the box as the element it
  animates from.

**Stop here and test.**

## Step 4 — connectors

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

## Step 5 — drag from a note to a note makes a link

- **The gesture**, with pan off: press on a box, drag (mouse or finger), release on another box. A
  line follows the pointer while dragging. The note under the release point is found with `document.elementFromPoint()`
  (`changedTouches[0]` for a finger).
- **The write goes through `applyCellEdits`**, exactly as a table cell edit does — so it is a
  verified, span-preserving front matter splice, one undo takes it back, and the refresh redraws the
  chart.
- **Where the link goes depends on the connectors property:**
  - **A front matter property the user owns** (`isPropertyEditable()`): append `[[target.md]]` to its
    list. If the connector text property is another such list, append the placeholder text to it as
    well so the two stay index-aligned.
  - **`internalLink`** (the default, which the app fills and nothing can write): append
    `[[target.md|link text here]]` to a front matter list called **`flowChartLink`**, created if the
    note does not have it. `internalLink` collects links from the body and every property, so the new
    one simply joins it, and its `|link text here` fills `internalLinkText` at the same index.
    The rare catch: if the connector text role points at some *other* property, the new link's
    position in `internalLink` and that property's list may not line up — accept that.
- **`link text here` is the placeholder**, meant to be replaced by opening the note (step 4's press).
- A link that already exists draws no second arrow — `internalLink` keeps one entry per target — so
  say so in the report line rather than writing a duplicate.

## Step 6 — drag from a note to empty space makes a new linked note

- **Release over no box** means "create a new note, linked from the one the drag started on".
- **A dialog asks for the name and folder.** Reuse `#modal-file-options` — it already has the folder
  field with the `gypsum-folders` datalist, the filename field and an error slot — in a "new note"
  mode that hides delete and offers one create button. Name and folder are validated the way rename
  and move already validate them (`editing/rename-file.js`).
- **Then**: `createEmptyNote(folder, filename)` (`services/create-note.js`), and the link written into
  the starting note exactly as step 5 writes one, with the same placeholder link text. If the node
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
| `public/js/services/flowchart/placeholder-layout.js` | step 1 — grid positions, pure, temporary |
| `public/js/ui/ui-functions-flowchart/render-svg.js` | steps 1, 3, 4 — boxes, labels, arrows |
| `public/js/ui/ui-functions-click/toggle-flowchart-render.js` | step 2 |
| `public/js/ui/ui-functions-click/flowchart-*.js` | steps 3–6 — one file per action |
| `public/js/ui/ui-functions-flowchart/node-drag.js` | steps 5–6 — the drag line and where it ends |
| `public/js/editing/add-flowchart-link.js` | steps 5–6 — which property gets the link, via `applyCellEdits` |
| `public/css/flowchart.css` | built — extend for boxes, arrows, labels |

**Tests**: the writes of steps 5 and 6 go in `tests/1-data/` (what lands in the note, `flowChartLink`
created and appended to, undo); the toggle, click-to-open and drags in `tests/2-behaviour/`.
