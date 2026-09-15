# Plan: the flowchart view

Status: **step 1 is built** — the view exists and writes mermaid source into a contenteditable code
block (`public/js/ui/render-file-list-flowchart.js`). Everything below is unbuilt.
Branch: `claude/magical-cori-z4j585`
Manifest version at step 1: `1.228.0` — bump the minor version with each step that changes code.

The view draws the note graph: one node per visible note, one edge per `[[internal link]]`, laid out
by dagre and drawn as SVG, with the mermaid source kept as an editable intermediate so the layout can
be tweaked and so the same text can be pasted into a mermaid editor elsewhere.

Four things are new to the codebase and each carries its own risk: a vendored layout library, a
parser for text the user may have edited, a renderer that is not a string of HTML, and writes to a
note that do not come from a table cell. §11 lists the problems I think are real, and §12 the
decisions I would take on them. **Read §11 before building any of this** — three of its points change
what step 3 has to emit.

The engine is **dagre**, not elkjs. §4.1 has the measurements behind that and §4.3 why elkjs was
rejected on size.

---

## 1. What the view is for

**Seeing which notes point at which.** Not a general diagramming tool. Every node is a note that is
currently visible — the same filtered, sorted set every other view draws — and every edge comes from
a property of a note. Nothing can be drawn that is not in the folder.

That is what decides the hard questions later. A node is not a shape the user placed, it is a note;
so it can be clicked to open, dragged to link, and cannot be deleted from the canvas. An edge is not
a connector, it is a value in a file; so drawing one writes to a note, and the note is the truth.

**The mermaid text is a working surface, not a document.** It exists so the layout can be nudged and
so the graph can leave the app. It is not saved anywhere and is not a file format the app owns.

---

## 2. The shape of the view

```
#output
  ├─ layout config block     (contenteditable, layout options as key: value lines)
  ├─ toggle: code | chart
  └─ either the mermaid code block  (step 1, built)
     or     the SVG canvas          (steps 3-5)
```

The config block sits above both because it applies to both: in code mode it is what will be used
when you flip to the chart, and reading it beside the mermaid text is how you learn what it does.

**Four property pickers** sit with the toggle, each a `<select>` over the registered properties:

| picks | default | what it must be |
|---|---|---|
| link source | `internalLink` | a list property |
| link text | `internalLinkText` | a list property, read index-aligned with the link source |
| node text | `title` | any property |
| node shape | *(none)* | any property; no selection means every node is `()` |

The defaults are what step 1 already emits. A picker offering a property that holds the wrong shape
is the user's business, exactly as a column type is — an unusable choice makes an odd-looking chart,
not an error. §11.2 is about what those defaults cost when it comes to *writing*.

---

## 3. The mermaid text is the graph's only input — and what that costs

**Decided, and it is the plan's load-bearing choice.** The SVG is laid out from the mermaid source in
the code block, not from `appState.myFiles`. So a hand-edit to the text is honoured, which is the
whole point of having the text.

It costs the thing that makes every interaction in §6 possible: **identity**. A node id in the text
is `1`, `2`, `3` — the file's position on the page. Nothing in the text says which note that is, and
after a hand-edit nothing guarantees it still means the same note. Click-to-open, drag-to-link and
every write needs to answer "which file is this node?" and the text as generated cannot.

**So the generator emits a mapping, as mermaid comments.** A line starting `%%` is ignored by every
mermaid renderer, so the text stays paste-able while carrying what the app needs:

```
flowchart TD
%% gypsum:1 work/notes.md
%% gypsum:2 budget.md

  1("Meeting 3 Mar")
  1 -->|"see notes"| 2
```

The parser reads those lines into a `nodeId → internalId` map. **A node with no mapping line is drawn
but is not a note**: it cannot be clicked, dragged from, or written to, and it is drawn faded to say
so. That covers the `u1("missing-note.md")` nodes step 1 already emits for broken links, and it
covers anything the user typed by hand. The degradation is the feature — hand-edit freely, and the
parts you invented simply are not notes.

**A write regenerates the text.** Any of §6's actions changes a file, the file list re-renders, and
the mermaid source is rebuilt from `appState.myFiles` — discarding hand-edits. There is no merge and
there should not be one; see §12.1 for how the view says so before it happens.

---

## 4. The layout engine

### 4.1 dagre, not elkjs

`@dagrejs/dagre` 3.1.1, vendored as `public/js/services/dagre.esm.js`, following the `marked.eos.js`
precedent that CLAUDE.md names. **Measured against a local copy in Chromium, not assumed:**

| | raw | gzipped |
|---|---|---|
| `dagre.esm.js` | 48,559 | 16,954 |
| `marked.eos.js`, already vendored here | 39,521 | — |
| `elk.bundled.js`, for comparison | 1,609,707 | 469,661 |

- **Already an ES module**, self-contained: no `import` of anything external, exporting `layout`,
  `Graph`, `graphlib` and a default. Vendoring is a straight copy with no conversion at all — where
  elkjs needed a UMD-to-ESM hack.
- **No worker, no network** beyond the module itself. Same-thread by construction.
- **Faster than elkjs**: 50 nodes / 49 edges in **45 ms** against elkjs's 137 ms. 200 nodes in
  131 ms, **500 nodes in 391 ms** — which is what lets §12.3 drop the node cap to a warning.
- Edges come back as a `points` polyline per edge, nodes as centre `x`/`y` with the `width`/`height`
  we gave them. Close enough to ELK's `sections`/`bendPoints` that §5.4's renderer is the same code
  either way.
- It is the layered (Sugiyama) algorithm mermaid itself used for years, which is the one thing a
  `flowchart TD` needs.

**MIT licensed**, so none of the EPL/GPL distribution question in §4.3 applies.

### 4.2 The config block

Layout options as one `key: value` per line, not JSON — the block has to be typed into by hand and a
missing brace should not lose the lot:

```
rankdir: TB
ranksep: 60
nodesep: 40
edgesep: 20
ranker: network-simplex
marginx: 20
marginy: 20
```

dagre has roughly fifteen graph-level options rather than ELK's 235, and no runtime descriptor list
to validate against — so `services/flowchart/layout-options.js` carries the allowed keys, their types
and their defaults explicitly. That is a list the app has to maintain, which ELK would have given for
free; at fifteen entries it is a table, not a burden, and having it written down is what lets the
block offer sensible defaults and refuse nonsense.

**An unknown key is dropped rather than honoured** — the same rule `table_layouts.gypsum` follows for
a hand-edited type name, and for the same reason: a typo must not be able to invent behaviour.
Dropped keys are named in the report line above the list, using the existing `output-report.js`.

### 4.3 Why not elkjs

It was the first choice and it works — I vendored it, converted it and ran it before measuring it.
It is rejected on size alone:

- **1.6 MB raw / 470 KB gzipped**, against 766 KB raw / 220 KB gzipped for every `.js` file under
  `public/` combined. Twice the entire application, on both measures, for one view.
- **There is no subset to take.** elkjs is GWT-compiled Java: one closure with string-keyed algorithm
  registries and dynamic dispatch, so a bundler cannot prove that `force`, `radial`, `stress`,
  `mrtree` and `rectpacking` are dead. Tested rather than assumed — `esbuild --bundle --minify`, which
  tree-shakes, took it from 1,609,707 to 1,459,774 bytes (**9%**, and gzipped only 6%). All of that is
  whitespace and renaming; no dead code was eliminated. elkjs publishes no per-algorithm build, and
  `elk-worker.min.js` at 1.59 MB is the same payload.
- The bulk is `layered` itself — the algorithm we actually want — so even a hypothetical
  algorithm-level split would not help much.
- Licensing is EPL-2.0 OR GPL-3.0-or-later, which the single-file artefact would have to carry.

**What is genuinely lost**, and it is not nothing:

- **Edge merging.** Your outline asked for it. `elk.layered.mergeEdges` makes edges sharing a source
  or target run together into a trunk near that node, which reads well on a hub. dagre has no
  equivalent. (Merging *parallel* edges — two links between the same pair — is a different thing and
  is already handled: `internalLink` is deduped per note, so parallel edges do not arise.)
- **Orthogonal and spline edge routing.** dagre gives one polyline per edge; ELK offers routing
  styles. A rounded polyline looks fine and §5.4 can smooth corners itself.
- **Fine control.** Fifteen options against 235.

If the chart is built and any of those turns out to matter, `layout-graph.js` (§5.3) is the only
module that would change — which is the point of it being a service that takes plain data and returns
plain data.

## 5. Parsing, laying out, drawing

### 5.1 Parser — `services/flowchart/parse-mermaid.js`

Parses the subset the app generates, and nothing else:

| line | meaning |
|---|---|
| `flowchart TD` / `LR` | direction; maps to `rankdir` unless the config block sets it |
| `%% gypsum:<id> <internalId>` | the identity map of §3 |
| `id("text")` and the other shape delimiters | a node, its label, its shape |
| `a --> b`, `a -->\|"text"\| b` | an edge, with an optional label |
| blank, and any other `%%` | ignored |

Anything else is a parse failure. **A failure keeps the previous chart on screen and says so in the
report line** — it does not blank the canvas, because you are usually mid-edit when it happens and a
disappearing diagram punishes a typo far out of proportion.

The parser returns plain data (`{ direction, nodes, edges }`), knows nothing about the layout engine
or the DOM,
and lives in `services/` because it is neither.

### 5.2 Node sizes

dagre needs `width` and `height` per node before it can place anything.

**Measure the text, do not estimate it from length.** A rough outline of this plan said to size boxes
from string length; with the proportional fonts this app uses, `WWWWW` and `iiiii` differ by about
three times, so estimated boxes would be wrong in both directions at once — clipped labels and
gaping space in the same chart. A single `CanvasRenderingContext2D` reused across the render, with
its `font` set from the computed style of the node class, measures a label in microseconds. One
helper, `services/flowchart/measure-label.js`, wraps the label to a maximum width and returns the
box. The same wrapped lines are then what the SVG draws, so the measurement and the drawing cannot
disagree.

### 5.3 Layout

`services/flowchart/layout-graph.js` turns parser output plus config into a `dagre.graphlib.Graph`,
runs `dagre.layout()`, and hands back plain data — nodes with a centre `x`/`y` and the `width`/`height`
they were given, edges with a `points` polyline. It is the **only** module that knows which engine is
in use, so swapping dagre for something else later (§4.3) touches one file.

`dagre.layout()` is synchronous, so the view renderer stays synchronous like every other one — one
fewer thing that is special about this view.

### 5.4 SVG renderer — `ui/ui-functions-flowchart/render-svg.js`

Built with `createElementNS`, not an HTML string, because §6 attaches behaviour per node and edge and
because labels must be set with `textContent` — which escapes by construction, so the
escape-everything rule is satisfied structurally rather than by remembering `escapeHtml` at nine call
sites.

One `<g>` per node carrying `data-node-id` and, when it is a note, `data-file-id`; one `<path>` per
edge carrying both endpoints' ids. Colours come from the existing custom properties, and a node whose
note has a colour uses the `color-dynamic` mechanism the cards already use.

---

## 6. Interactivity

In rough order of cost. **Everything from "drag to link" down writes to a note** and is gated on
§11.2 being resolved.

1. **Pan and zoom.** A `viewBox` on the root `<svg>`, moved on pointer drag and scaled on wheel about
   the cursor. You said you have an implementation you like — drop it in and this plan should adopt
   it rather than invent a second one. The only thing to settle here is that the viewBox survives a
   re-render, the way `keep-cell-state.js` carries the table's scroll position.
2. **Click a node to open the note.** `data-file-id` is already the attribute
   `open-file-content-modal` expects, so this is a `data-action` on the group and nothing more. A
   node with no mapping (§3) has no `data-file-id` and so does nothing.
3. **Click an edge to set its link text.** Writes the link-text property. This is the cheapest write
   because `internalLinkText` is ordinary front matter and `applyCellEdits` already does it — but see
   §11.3 on keeping the list index-aligned.
4. **Drag node → node to create a link.** Writes the link-source property of the drag-start note.
5. **Drag node → empty space to create a note.** `createEmptyNote()` in `services/create-note.js`
   already makes the file and registers it, and `create-linked-note.js` is the precedent for creating
   and then navigating. What is missing is the name: see §11.6.
6. **Edit a property shown in a node.** Wants the table's editing path and its undo stack. §11.2 and
   §11.7.

---

## 7. Where the code goes

| Path | |
|---|---|
| `public/js/services/dagre.esm.js` | vendored, copied unmodified |
| `public/js/services/flowchart/parse-mermaid.js` | text → `{direction, nodes, edges}` |
| `public/js/services/flowchart/measure-label.js` | label → wrapped lines + box |
| `public/js/services/flowchart/layout-graph.js` | graph + config → dagre → placed graph |
| `public/js/services/flowchart/layout-options.js` | config block text ↔ validated options |
| `public/js/ui/render-file-list-flowchart.js` | **built** — emits the mermaid source |
| `public/js/ui/ui-functions-flowchart/render-svg.js` | placed graph → SVG DOM |
| `public/js/ui/ui-functions-flowchart/pan-zoom.js` | the viewBox |
| `public/js/ui/ui-functions-flowchart/node-drag.js` | drags 4 and 5 |
| `public/js/ui/ui-functions-click/flowchart-*.js` | one file per click action, per the house rule |
| `public/css/flowchart.css` | **built** — extend for the SVG and controls |

The three-layer rule holds: parsing, measuring and layout are services and touch no DOM; the SVG
renderer produces nodes and reads `appState`; the click and drag files are thin and call a service.

---

## 8. Steps

Each is shippable and each bumps the manifest minor version.

- **Step 1 — the code block.** *Built.* `1.228.0`.
- **Step 2 — the UI frame.** Config block, code/chart toggle, four property pickers; the pickers
  change what step 1 emits. No layout engine yet. Proves the controls before anything depends on them.
- **Step 3 — identity comments.** Add the `%% gypsum:` lines and the parser. Still no chart: the
  test is that parsing the app's own output reproduces the graph it was generated from.
- **Step 4 — first chart.** Vendor dagre, lay out, draw the SVG, no interaction. Ship the toggle.
- **Step 5 — pan, zoom, click-to-open.** Read-only interaction; the view becomes genuinely useful
  here and could reasonably stop here for a while.
- **Step 6 — the writes.** Edge label, then drag-to-link, then drag-to-create. Only after §11.2 has
  an answer; each is a separate commit.
- **Step 7 — node property editing and undo.** The largest, and the one with the least certain
  payoff. §11.7.

---

## 9. What v1 knowingly does not do

- No sub-graphs, no clusters, no node grouping by tag or folder.
- No saved chart: the config and the pickers are session state (§11.8), the mermaid text is scratch.
- No node dragging to reposition — the layout engine owns placement. A hand-placed node would be lost on the next
  layout and there is nowhere to persist it.
- No deleting a note or a link from the canvas. Removing an edge means removing a value from a file,
  and a drag that silently unlinks two notes is the one gesture here that could lose data quietly.
- No mermaid feature the app does not itself emit.

---

## 10. Testing

Playwright, following `tests/helpers.js`. The parser and the options validator are pure functions
over strings and deserve direct tests. The chart needs: a graph draws with the right node count; a
broken link draws a faded unmapped node; a hand-edit to the text changes the chart; a nonsense edit
keeps the previous chart and reports; an unknown config key is dropped and named; click-to-open opens
the right note. Screenshot the SVG in all three themes — dagre's output is deterministic for a given
input, so the geometry is stable enough to compare.

---

## 11. Problems with the plan as outlined

These are the things I think will bite. Three of them change what step 3 emits, so they are worth
settling before building.

### 11.1 The round trip fights itself

Parsing the mermaid text so hand-edits survive, and writing to files from the chart, are in direct
conflict: every write re-renders, and every re-render regenerates the text. Hand-edit the layout,
then drag one link, and the edits are gone.

There is no clever merge available — the text has no anchor to merge against once it has been
retyped. §12.1 takes the honest version instead.

### 11.2 The default properties are the ones the app will not let you write

This is the biggest one, and it is not obvious from the outline.

`internalLink` and `title` — the defaults for links and node text — are both in
`CORE_FILE_PROPERTIES`, so `isPropertyEditable()` returns false for both, and both are *derived from
the note's body*: `internalLink` from `[[...]]` in the text, `title` from the `# heading`. They do not
live in front matter, so `applyCellEdits` and `applyRawEdits` — which splice a YAML value span —
cannot write them at all.

So with the defaults in place:

- **drag-to-link** must append `[[target]]` to the note's **body**, which is a writer that does not
  exist yet and which has no span to splice;
- **editing node text** would be editing a `# heading`, which is the very thing `CORE_FILE_PROPERTIES`
  exists to refuse;
- only **edge labels** work through the existing machinery, because `internalLinkText` is ordinary
  front matter.

§12.2 is the way through.

### 11.3 Index alignment between links and link text is fragile

`internalLinkText[n]` labels `internalLink[n]`. But `internalLink` is derived, ordered by position in
the body, and **deduped** — two `[[budget.md]]` in one note produce one entry. Labelling the third
edge means writing a list with two padding entries before it, and then any body edit that adds a link
above shifts every label onto the wrong edge, silently.

It works today because nothing writes the list. Making edge labels editable is what exposes it.

### 11.4 Pagination makes a graph that is not true

The orchestrator computes a 50-file page for every view and appends the pagination nav unconditionally.
In a table, page 2 is just the next rows. In a graph, a link to a note on another page becomes an
orphan node — the chart shows a fragment while looking like a whole.

Against that: layout cost grows with the graph. dagre does 500 nodes in 391 ms on the main thread,
which is a perceptible but survivable pause — so this is a question about truthfulness, not speed.

### 11.5 The size of it — resolved by §4.3, but not to zero

elkjs at 1.6 MB was the original answer and was rejected; dagre at 48.5 KB raw / 17 KB gzipped is the
same order as the already-vendored `marked.eos.js`, so it sits inside the precedent CLAUDE.md names
rather than stretching it.

What remains: it is still a sixth of the app's raw JS arriving for one view, and in development there
is no build step, so it crosses the wire on a hard reload. A dynamic `import()` at the point the
flowchart view is first opened keeps every other view exactly as fast as it is today, and costs one
`await`. Worth doing; not worth doing before step 4 proves the view earns its place.

### 11.6 A drag that ends in a prompt is a poor gesture

Drag-to-empty-space has to name a file. Stopping the drag to open a modal breaks the gesture, and
`createNoteFromLink` wants `{folder, filename}` up front.

### 11.7 Undo is table-only on purpose

`canReverse()` in `undo-cell-edit.js` refuses unless `viewState === VIEWS.TABLE.value`, and
`plans/table-undo-stack.md` §10.4 argues that deliberately: the stack records writes made from the
table, and elsewhere there is nothing to see the result against. Widening the gate is one line; giving
it meaning is not — `flashUndoneCells` marks table cells, and a flowchart has none.

There is also a real question of whether Ctrl+Z on a canvas means "undo my last property edit" or
"undo my last pan", and those cannot both be true.

### 11.8 Nowhere to persist the pickers or the config

`table_layouts.gypsum` holds column layouts and property types; the flowchart's four pickers and its
layout options belong to neither, and that file is named for the table. A new `.gypsum` file is a
migration, a writer, and a way to delete it — real work for something nobody has asked to keep yet.

### 11.9 Smaller things

- **View transitions.** The flowchart renderer emits no `data-vt-id`, so `renderFiles` sees "nothing
  matches" and starts a transition on every render. Crossfading a whole SVG re-layout for a second is
  not what anyone wants. It needs to opt out.
- **Re-layout on every keystroke** in the code block would parse and lay out per character. Layout on
  blur, or debounced, and never on input.
- **Node shapes need a mapping.** A property holds `decision`, not `{}`. It wants a small
  value → shape-name table (`rounded`, `stadium`, `circle`, `rhombus`, `hexagon`, `subroutine`,
  `cylinder`) with an unknown value falling back to `()`.
- **The engine does not do shapes.** dagre places boxes; the shape is the SVG renderer's business,
  and a rhombus wants more width than its text to stay legible, which §5.2's measurement has to know
  about.

---

## 12. What I would decide

Yours to overrule — these are the answers I would build against.

### 12.1 One direction at a time, and the view says which

The code block has two states. **In sync**: regenerated from the files on every render, and every
interaction in §6 works. **Detached**: the user has typed in it, so it is now the input, the chart
follows it, and pan, zoom and click-to-open still work through whatever `%% gypsum:` lines survived —
but the writing actions are switched off, visibly, with a "re-sync from notes" button beside the
toggle. Typing in the block detaches it; re-syncing discards the edits and says so first.

This gives you what the tweaking is for without pretending the app can merge your text with the
folder.

### 12.2 Writes go through front matter only, in v1

A write action is offered when the property it writes is editable — i.e. when you have pointed the
link picker at a front-matter list rather than at `internalLink`. With the defaults, edge labels work
and the two drags do not, and the UI says why rather than failing.

Appending `[[target]]` to a note's body is then a separate, later piece of work with its own plan:
it needs a body writer, a decision about *where* in the body a link lands, and an answer for a note
open in the editor with unsaved changes. It is a bigger job than it looks and does not belong inside
this one.

### 12.3 Lay out the filtered set, not the page

The flowchart opts out of pagination — `renderFiles` learns one flag for it, and the nav is not
appended. A partial graph that looks whole is worse than a graph that says it will not draw.

dagre's 391 ms at 500 nodes means the cap is about legibility rather than speed: a 500-node chart is
unreadable long before it is slow. So draw it, and say in the report line that it is large — rather
than refusing, which is what elkjs's cost would have forced.

### 12.4 Session state, and revisit it

Pickers and config live in `appState.flowchartState`, lost on reload, exactly as `viewState` is. If
you find yourself retyping the same layout options every session, that is the evidence that they want
a file — and by then the flowchart will have told us what else belongs in it.

### 12.5 Undo stays out

Step 7 last, and probably not at all. Property editing from a node is a want, not a need — the table
edits properties well and the flowchart's job is showing structure.

---

## 13. Open questions for you

1. **Is §12.1's two-state code block what you meant by "allow user tweaks"** — tweak the layout and
   look, then re-sync to act? Or did you intend the tweaks to be durable in a way that survives
   writing to notes?
2. **Do the property pickers change the mermaid source, or only the chart?** Changing the source
   keeps one pipeline and makes the pickers visible in the text; not changing it keeps the exported
   mermaid canonical.
3. **The pan/zoom implementation you mentioned** — worth dropping in before step 5 so this plan
   adopts it rather than growing a second one.
4. **Is losing ELK's edge merging a problem?** It is the one thing in your outline that dagre has no
   answer for (§4.3). If a hub note with twenty inbound links has to read well, that is the argument
   for paying elkjs's 1.6 MB after all — and §5.3 keeps the swap to one file.
