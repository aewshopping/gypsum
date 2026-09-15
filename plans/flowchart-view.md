# Plan: the flowchart view

Status: **step 1 is built** — the view exists and writes mermaid source into a contenteditable code
block (`public/js/ui/render-file-list-flowchart.js`). Everything below is unbuilt.
Branch: `claude/magical-cori-z4j585`
Manifest version at step 1: `1.228.0` — bump the minor version with each step that changes code.

The view draws a **choose-your-own-adventure story map**: one node per note, one edge per choice,
laid out top-down and drawn as SVG, with the mermaid source kept as an editable intermediate so the
same graph can be pasted into a mermaid editor elsewhere.

**The layout engine is written here, not vendored.** That is the plan's bet and §5 is where it is
argued. It is a bet because the alternatives were measured first and both were wrong for this: elkjs
is 1.6 MB for one view, and dagre is small but cannot do the one thing a story map most needs. §5.1
has those numbers. **Step 2 exists to find out whether the bet comes off**, before anything else is
built on it.

---

## 1. What the view is for

**Authoring a branching story.** Every note is one story node; every `[[link]]` is a choice the
reader can take; the link's text is the words on the choice. The map is how the author sees the shape
of what they have written — and, once §7 lands, how they extend it.

That is not the same thing as an Obsidian-style vault graph, and the difference decides almost every
question below:

- **Direction is real.** "A leads to B" means the reader moves from A to B. Drawing it top-down
  asserts something true, where in a vault graph it would assert a hierarchy that is not there.
- **The graph is mostly a DAG**, with a few deliberate loops back ("return to the crossroads"). That
  is the easy case for layered layout — a densely reciprocal graph is what breaks it.
- **It is small and hand-made.** Bounded by what one person wrote: tens of nodes, maybe a couple of
  hundred. Throughput does not matter; how good it looks at fifty nodes matters enormously.
- **Convergence is the signature shape.** Five choices arriving at "you reach the tavern" is what a
  story graph does constantly, and drawing it well is the single biggest quality difference between
  a good story map and a bad one.

**The mermaid text is a working surface, not a document.** It exists so the graph can leave the app
and so the layout can be nudged. It is not saved and is not a file format the app owns.

---

## 2. The shape of the view

```
#output
  ├─ layout config block     (contenteditable, layout options as key: value lines)
  ├─ toggle: code | chart    + the property pickers + the story checks
  └─ either the mermaid code block  (step 1, built)
     or     the SVG canvas          (steps 3-6)
```

**Four property pickers**, each a `<select>` over the registered properties:

| picks | default | what it must be |
|---|---|---|
| link source | `internalLink` | a list property |
| choice text | `internalLinkText` | a list property, read index-aligned with the link source |
| node text | `title` | any property |
| node shape | *(none)* | any property; no selection means every node is `()` |

The defaults are what step 1 already emits. A picker pointed at a property holding the wrong shape is
the user's business, exactly as a column type is — an unusable choice makes an odd-looking chart, not
an error.

**The shape picker earns its place here in a way it would not in a note graph**: a story has node
*kinds* — the opening, an ordinary beat, an ending — and a front matter `nodeType` mapped to a shape
is how the map shows them apart at a glance.

---

## 3. Where the links and the choice text live

**Front matter, not the prose, and the reason is the static site generator.** The book is built from
these files with Eleventy: the body is the story text that becomes the page, and the choices are
navigation that the template renders separately as links or buttons. Putting `[[cave.md|push the
door]]` inline would mean the SSG has to strip it back out of the prose it is trying to render.

So the two defaults are front matter lists, read index-aligned:

```yaml
internalLink:
  - cave.md
  - road.md
internalLinkText:
  - push open the heavy door
  - walk on down the road
```

**That alignment is the plan's main data risk**, and it is §13.2. Two lists that must stay in step,
edited by hand, with nothing to keep them honest: delete one entry from one list and every choice
silently attaches to the wrong door.

### 3.1 The one-list form, as v2

The fix is to stop having two lists:

```yaml
choices:
  - cave.md|push open the heavy door
  - road.md|walk on down the road
```

Misalignment becomes impossible, because there is nothing to misalign. **Tested against gypsum's own
parser**, this reads back as a plain list of two strings — so it needs nothing new anywhere: table
cell editing, search, `flow-list.js` and `applyCellEdits` all already handle a flat list of strings,
and Eleventy's side is a `split('|')` in a filter.

The cost is that it is denser to read in the file, which is the reason it is v2 and not v1.
Mitigations worth weighing when it comes: once §7 lands the flowchart writes these, so they are rarely
hand-typed; and the table could render a piped list as two readable columns without changing what is
stored. One rule if it is built: **split on the first pipe only**, so a choice containing one survives.

**The list-of-maps form — the one that reads best — is not available.** Tested, not assumed:

```yaml
choices:
  - to: cave.md
    text: push open the heavy door
```

gypsum's YAML parser refuses it, with `list item holding a key is not supported` and `key inside a
list is not supported`, so every story node would carry a load error. It needs the parser to grow
nesting first, which is its own plan, not a v3 of this one.

---

## 4. The mermaid text, and the identity problem

**The SVG is laid out from the mermaid source in the code block, not from `appState.myFiles`.** So a
hand-edit to the text is honoured, which is the whole point of the text existing.

It costs **identity**. A node id in the text is `1`, `2`, `3` — the file's position. Nothing in the
text says which note that is, and after a hand-edit nothing guarantees it still means the same one.
Click-to-open and every write in §7 has to answer "which file is this node?" and the text as generated
cannot.

**So the generator emits a mapping, as mermaid comments.** A line starting `%%` is ignored by every
mermaid renderer, so the text stays paste-able while carrying what the app needs:

```
flowchart TD
%% gypsum:1 chapters/crossroads.md
%% gypsum:2 chapters/cave.md

  1("The crossroads")
  1 -->|"push open the heavy door"| 2
```

**A node with no mapping line is drawn but is not a note**: not clickable, not writable, drawn faded
to say so. That covers the `u1("missing-note.md")` nodes step 1 already emits for a broken link — in a
story, a choice pointing at a scene you have not written yet, which is a thing an author does on
purpose — and it covers anything typed by hand. The degradation is the feature.

**A write regenerates the text**, discarding hand-edits. There is no merge and there should not be
one; §14.1 is how the view says so before it happens.

---

## 5. The layout engine, written here

### 5.1 Why not a library

Both were fetched, vendored and run before being rejected. The numbers are real.

| | raw | gzipped | 50 nodes |
|---|---|---|---|
| `elk.bundled.js` | 1,609,707 | 469,661 | 137 ms |
| `dagre.esm.js` | 48,559 | 16,954 | 45 ms |
| `marked.eos.js`, already vendored here | 39,521 | — | — |

**elkjs** does everything this view wants, including edge merging. It is rejected on size: 1.6 MB
against 766 KB for every `.js` file under `public/` combined — twice the whole application, for one
view. **There is no subset to take**: it is GWT-compiled Java, one closure with string-keyed algorithm
registries and dynamic dispatch, so nothing can prove the other algorithms are dead. Tested —
`esbuild --bundle --minify`, which tree-shakes, recovered 9% raw and 6% gzipped, all of it whitespace
and renaming. No per-algorithm build is published and the worker build is the same payload.

*(A lazy `import()` would have made it affordable: esbuild with splitting off inlines a dynamic import
into the same output file as a deferred function, so other views would pay nothing and the artefact
would stay one file. Tested, and worth remembering — but it only defers execution, not download.)*

**dagre** is the right size and does layered layout well. It cannot merge edges — the exact shape §1
says a story map is made of. Five choices arriving at the tavern draw as five separate arrowheads into
one box. It also routes only polylines, and routes back edges — which a story has — as long swoops
across the diagram.

**So the choice was 1.6 MB for the feature, or 48 KB without it.** Writing it gives both, and edge
merging is not a standard algorithm anyone would be reusing anyway: it is a custom pass ELK bolted on,
and roughly 45 lines to do ourselves.

### 5.2 The pipeline

Sugiyama, which is a sequence of small well-documented passes rather than one big algorithm. Each is
its own module in `services/flowchart/layout/`, each takes plain data and returns plain data, and each
can be tested on its own.

| pass | what it does | est. lines |
|---|---|---|
| `break-cycles.js` | DFS; reverse back edges, remember which, flip them back at the end | 25 |
| `assign-layers.js` | longest-path — "how many choices deep is this beat" | 40 |
| `add-dummies.js` | an edge crossing three layers becomes three hops | 35 |
| `reduce-crossings.js` | median heuristic + adjacent transpose, a few sweeps | 90 |
| `place-nodes.js` | median relaxation for x, layer index for y | 70 |
| `route-edges.js` | right-angle segments along each dummy chain | 60 |
| `merge-edges.js` | inbound edges share a junction one gap above the target | 45 |
| `place-labels.js` | reserve width, place on the longest straight segment | 50 |
| `layout-graph.js` | the glue, and the only public entry point | 60 |

**≈ 500 lines.** For scale, this repo's cell-editing subsystem is 925 lines and `file-parsing/` is
1,208 — so this would be an ordinary-sized subsystem here, not an outlier, and it fits CLAUDE.md's
"no external dependencies, keep it small and readable" better than vendoring either library does.

**On "clean room" in the legal sense: not a concern.** Algorithms are not copyrightable, and
Sugiyama, the median heuristic and Brandes–Köpf are published papers. Implementing from the literature
is entirely clear of elkjs's EPL. Only copying their source would matter, and there is no reason to
look at it.

### 5.3 What it deliberately will not do

This is the whole reason it can be 500 lines instead of 1.6 MB. Not gaps to fill in later — the
scope:

- One algorithm. No force, radial, tree, stress or rectangle packing.
- No compound or nested nodes.
- No ports. An edge meets a node at the middle of its top or bottom.
- No splines. Orthogonal segments only, with corners rounded in the SVG.
- No incremental or stable layout across renders. Every layout is from scratch.
- No hyperedges, no self-loops drawn prettily (a note linking to itself gets a small stub).
- Roughly eight options (§5.4), not 235.

### 5.4 The config block

One `key: value` per line, not JSON — the block is typed into by hand and a missing brace should not
lose the lot:

```
direction: down
layerGap: 70
nodeGap: 40
mergeEdges: true
labelPlacement: segment
maxNodeWidth: 220
```

`services/flowchart/layout-options.js` holds the allowed keys, their types and their defaults, and
**an unknown key is dropped rather than honoured** — the rule `table_layouts.gypsum` already follows
for a hand-edited type name, and for the same reason: a typo must not invent behaviour. Dropped keys
are named in the report line, via the existing `output-report.js`.

---

## 6. Measuring and drawing

### 6.1 Node sizes

The engine needs `width` and `height` per node before it can place anything.

**Measure the text, do not estimate it from length.** With proportional fonts `WWWWW` and `iiiii`
differ about threefold, so estimated boxes would clip labels and gape in the same chart. One
`CanvasRenderingContext2D`, reused across the render with its `font` set from the computed style of
the node class, measures a label in microseconds. `services/flowchart/measure-label.js` wraps to
`maxNodeWidth` and returns the box — and **returns the wrapped lines too**, so the measurement and the
drawing cannot disagree. A non-rectangular shape (a rhombus ending) needs more box than its text, so
the shape is an input here, not only to the renderer.

### 6.2 The SVG

`ui/ui-functions-flowchart/render-svg.js`, built with `createElementNS` rather than an HTML string:
§7 attaches behaviour per node and edge, and labels are set with `textContent`, which escapes by
construction — so the escape-everything rule is satisfied structurally rather than by remembering
`escapeHtml` at nine call sites.

One `<g>` per node carrying `data-node-id` and, when it is a note, `data-file-id`; one `<path>` per
edge carrying both endpoint ids. Colours come from the existing custom properties, and a node whose
note has a colour uses the same `color-dynamic` mechanism the cards do.

---

## 7. Interactivity

In rough order of cost.

1. **Pan and zoom.** A `viewBox` on the root `<svg>`, moved on pointer drag and scaled on wheel about
   the cursor. You have an implementation you like — drop it in rather than growing a second one. The
   viewBox must survive a re-render, the way `keep-cell-state.js` carries the table's scroll position.
2. **Click a node to open the note.** `data-file-id` is already what `open-file-content-modal`
   expects, so this is a `data-action` and nothing more.
3. **Click an edge to write its choice text.** Writes the choice-text property — ordinary front
   matter, so `applyCellEdits` already does it. §13.2 is the catch.
4. **Drag node → node to add a choice.** Appends to the link-source list of the drag-start note, and
   a matching entry to the choice-text list. Two lists to keep in step, which is §3.1's argument
   restated as code.
5. **Drag node → empty space to write the next scene.** The gesture that grows the story:
   `createEmptyNote()` makes the file, then the choice is added as in 4, then the new note opens.
   §13.5 is the naming problem.

**All of these are front-matter writes**, which is the happy consequence of §3 — no body writer is
needed, and `applyCellEdits`/`applyRawEdits` already splice a YAML value span without disturbing the
rest of the file.

---

## 8. The story checks

The thing a story map is *for*, beyond looking at. None of it is layout; all of it is a walk over the
parsed graph, and it is cheap once the graph exists.

- **Unreachable scenes** — written, but no path from the start reaches them. The most common real bug
  in a branching story and invisible in a file list.
- **Dead ends** — a scene with no outgoing choices that is not marked as an ending. The reader hits a
  wall.
- **Broken choices** — a link naming no file. Already surfaced as `errorOnLoad` by `file-errors.js`
  (`linkSegment`), so this is drawing what the app already knows.
- **The start node** — one scene has to be the opening. A front matter flag, or failing that the node
  with no inbound edges; if there are several, that is itself worth saying.

Each marks its nodes in the SVG and reports a count in the line above the list. **Nothing is
auto-fixed** — these are things only the author can resolve.

---

## 9. Where the code goes

| Path | |
|---|---|
| `public/js/services/flowchart/parse-mermaid.js` | text → `{direction, nodes, edges}` |
| `public/js/services/flowchart/measure-label.js` | label + shape → wrapped lines and box |
| `public/js/services/flowchart/layout-options.js` | config block text ↔ validated options |
| `public/js/services/flowchart/layout/*.js` | the nine passes of §5.2 |
| `public/js/services/flowchart/story-checks.js` | §8, a walk over the graph |
| `public/js/ui/render-file-list-flowchart.js` | **built** — emits the mermaid source |
| `public/js/ui/ui-functions-flowchart/render-svg.js` | placed graph → SVG DOM |
| `public/js/ui/ui-functions-flowchart/pan-zoom.js` | the viewBox |
| `public/js/ui/ui-functions-flowchart/node-drag.js` | drags 4 and 5 |
| `public/js/ui/ui-functions-click/flowchart-*.js` | one file per click action, per the house rule |
| `public/css/flowchart.css` | **built** — extend for the SVG and controls |

The three-layer rule holds: every pass in `layout/` is a pure function over plain data and touches no
DOM; the SVG renderer produces nodes and reads `appState`; the click and drag files are thin.

---

## 10. Steps

- **Step 1 — the code block.** *Built.* `1.228.0`.
- **Step 2 — the layout spike. This is the go/no-go.** Build passes 1 to 5 — cycles, layers, dummies,
  crossings, placement — as a throwaway outside the repo, feed it a realistic branching story of
  40-60 scenes with the convergences and the loops back, and *look at it*. §11 is the standard it has
  to meet. Nothing else here is worth building until this has been seen.
- **Step 3 — the UI frame.** Config block, code/chart toggle, the four pickers; the pickers change
  what step 1 emits. Independent of step 2, so it can proceed in parallel.
- **Step 4 — identity comments and the parser.** The `%%` lines and `parse-mermaid.js`. The test is
  that parsing the app's own output reproduces the graph it came from.
- **Step 5 — first chart.** The engine moves into the repo, plus routing, merging, labels and the SVG.
  No interaction.
- **Step 6 — pan, zoom, click-to-open.** Read-only. The view becomes genuinely useful here and could
  reasonably rest a while.
- **Step 7 — the story checks.** §8. Cheap, and the highest value per line in the whole plan.
- **Step 8 — the writes.** Edge text, then drag-to-link, then drag-to-create.
- **Step 9 — the one-list choice format.** §3.1, and migrating to it.

---

## 11. How step 2 is judged

Vague acceptance criteria are how a spike gets waved through. These are the ones that matter, in
order:

1. **No edge crosses another where a human would obviously not draw it so.** A few crossings in a
   branching story are unavoidable; a tangle is the failure.
2. **A linear run of scenes draws as a straight vertical line.** If the spine zigzags, coordinate
   assignment is not good enough and the map is unpleasant to read. This is the pass most likely to
   disappoint.
3. **Convergence looks deliberate** — five choices into the tavern read as a fan, not a mess.
4. **The back edges are visible as back edges** and do not cross the body of the diagram.
5. **It fits on a screen at a sensible zoom** for 40-ish scenes.

Judged on screenshots of a real story graph, not a synthetic one — a synthetic graph has none of the
convergence that makes this hard.

**If it fails**, the retreat is dagre for passes 1-5 with our own routing and merging on top. It is
explicitly *not* the plan and not the thing to design for — naming it here so that a disappointing
spike is a decision rather than a surprise.

---

## 12. What v1 knowingly does not do

- No sub-graphs, chapters, or grouping by folder or tag.
- No saved chart: the pickers and config are session state (§14.4), the mermaid text is scratch.
- No node dragging to reposition — the engine owns placement, and a hand-placed node would be lost at
  the next layout with nowhere to persist it.
- No deleting a scene or a choice from the canvas. Removing an edge means removing a value from a
  file, and a drag that silently unlinks two scenes is the one gesture here that could lose writing.
- No mermaid feature the app does not itself emit.
- No playtesting the story in-app. Tempting, and a different plan.

---

## 13. Problems

### 13.1 The engine might not look good enough

The honest one. Crossing reduction and coordinate assignment are where naive implementations show,
and the failure is very visible: needless crossings and zigzagging spines. The classic trap is that it
looks fine on an eight-node test and falls apart at sixty. That is exactly why §10's step 2 comes
before everything and why §11 is written down in advance.

Mitigating it: story graphs are the *easy* case — small, mostly acyclic, mostly shallow — and the
passes that are hardest to get right are the ones that matter most on the graphs we are not drawing.

### 13.2 Two lists that must stay in step

`internalLinkText[n]` labels `internalLink[n]`, with nothing enforcing it. Hand-edit one list and
every choice after the edit attaches to the wrong door — silently, because both lists are still valid.

Worse here than in a note graph, because the payload is the words the reader sees. §3.1 is the answer
and it is deferred to v2; until then the flowchart's own writes must update both lists together, and
the story checks (§8) should probably flag a length mismatch as a sixth check.

### 13.3 Pagination makes a story that is not true

`renderFiles` computes a 50-file page for every view and appends the nav unconditionally. In a table
that is just the next rows. In a story map, a choice leading to a scene on another page becomes an
orphan node — the map shows a fragment while looking whole. §14.3.

### 13.4 The round trip fights itself

Parsing the mermaid so hand-edits survive, and writing to files from the chart, are in conflict: every
write re-renders and regenerates the text. Edit the layout, drag one choice, and the edits are gone.
No merge is available once the text has been retyped. §14.1 takes the honest version.

### 13.5 A drag that ends in a prompt is a poor gesture

Drag-to-empty-space has to name a file, and stopping the gesture to open a modal breaks it. An
auto-named `scene-7.md` opened straight into the editor is probably better than asking, since the
author is about to write the scene anyway and can rename from the table.

### 13.6 Smaller things

- **View transitions.** The flowchart renderer emits no `data-vt-id`, so `renderFiles` sees "nothing
  matches" and starts a transition on every render. Crossfading a whole SVG re-layout for a second is
  not wanted; it needs to opt out.
- **Re-layout on every keystroke** in the code block would parse and lay out per character. On blur,
  or debounced, never on input.
- **Node shapes need a mapping** from a property value (`ending`, `start`) to a shape name, with an
  unknown value falling back to `()`.
- **`title` is read-only**, being derived from the `# heading`, so node text cannot be edited from the
  map. Correct, and worth knowing before someone tries.
- **Nowhere to persist the pickers or the config.** `table_layouts.gypsum` is named for the table and
  holds column layouts and property types; these belong to neither.

---

## 14. Decisions

### 14.1 One direction at a time, and the view says which

The code block has two states. **In sync**: regenerated from the files on every render, and every
interaction in §7 works. **Detached**: it has been typed in, so it is now the input; pan, zoom and
click-to-open still work through whatever `%% gypsum:` lines survived, but the writing actions switch
off, visibly, with a "re-sync from notes" button. Typing detaches; re-syncing discards and says so
first.

### 14.2 Front matter for everything

No body writer in this plan. §3's reasoning makes that a consequence rather than a compromise, and it
keeps every write in §7 on the existing, tested `applyRawEdits` path.

### 14.3 Lay out the filtered set, not the page

The flowchart opts out of pagination — `renderFiles` learns one flag, and the nav is not appended. A
story is bounded by what one person wrote, so there is no cap worth enforcing; if a folder is large
enough to be slow, the honest answer is that it is not one story and should be filtered.

### 14.4 Session state, and revisit it

Pickers and config live in `appState.flowchartState`, lost on reload, exactly as `viewState` is.
Retyping the same options every session is the evidence that they want a file — and by then the view
will have said what else belongs in it.

---

## 15. Open questions

1. **Is there a real story to test against?** Step 2's judgement depends on it, and a synthetic graph
   will flatter the engine by having none of the convergence that makes layout hard.
2. **How is an ending marked?** A `nodeType` front matter property is the obvious answer and it feeds
   the shape picker and two of the story checks at once — but it is a convention the book's Eleventy
   templates will also want, so it should be decided once, for both.
3. **Does the mermaid round trip still earn its keep?** It was designed when the purpose was unstated.
   An author working in files may only ever want the export, in which case §4's identity comments stay
   but §14.1's detached state could go, and the plan gets simpler.
4. **Loops back — as edges, or as something else?** "Return to the crossroads" drawn as a long edge up
   the diagram is honest but noisy. Some story tools draw it as a labelled stub instead. Worth
   deciding at step 5, once there is something to look at.
