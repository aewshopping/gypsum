# Plan: the flowchart view

Status: **step 1 is built** — the view exists and writes mermaid source into a contenteditable code
block (`public/js/ui/render-file-list-flowchart.js`). Everything below is unbuilt.
Branch: `claude/magical-cori-z4j585`
Manifest version at step 1: `1.228.0` — bump the minor version with each step that changes code.

The view draws a **directed map of the links between notes**: one node per note, one edge per link,
laid out top-down and drawn as SVG, with the mermaid source kept as an editable intermediate so the
same graph can be pasted into a mermaid editor elsewhere.

The case that prompted it is a branching story — each note a node of a choose-your-own-adventure,
each link a choice — and that is what the defaults are tuned for. **Nothing in the design is
story-only**, and §1 is written as the class of graph the view suits rather than the one use of it.

**The layout engine is written here, not vendored.** That is the plan's bet and §5 is where it is
argued. It is a bet because the alternatives were measured first and both were wrong for this: elkjs
is 1.6 MB for one view, and dagre is small but cannot do the one thing this class of graph most needs. §5.1
has those numbers. **Step 2 exists to find out whether the bet comes off**, before anything else is
built on it.

---

## 1. What the view is for

**Seeing the shape of a set of linked notes, and extending it.** Every node is a note, every edge is a
link held in one of its properties, and the map is how the structure becomes visible — structure being
the one thing a file list, a table and a search all hide.

It is not a general diagramming tool and not an Obsidian-style vault graph. **It suits a particular
class of graph**, and every decision below follows from that class rather than from any one use of it:

- **Direction means something.** "A leads to B" is a fact worth drawing as a fact. A top-down layout
  asserts it; in a graph of loose associations it would assert a hierarchy that is not there.
- **Mostly acyclic**, with a few deliberate loops back. That is the easy case for layered layout — a
  densely reciprocal graph is what breaks it.
- **Small and hand-made.** Bounded by what a person wrote: tens of nodes, maybe a couple of hundred.
  Throughput does not matter; how good it looks at fifty nodes matters enormously.
- **Convergence is common.** Several nodes arriving at one is the shape that most separates a good
  map from a bad one, and §5.1 is why it drives the choice of engine.

A branching story fits that description exactly, which is why it prompted the work. So do a process or
runbook, a dependency map, a decision tree, a set of linked meeting notes leading to one decision, a
recipe's steps. **The test applied to every feature below is whether it makes sense in those too**, and
where a feature only made sense for a story it has been generalised or dropped.

**The mermaid text is a working surface, not a document.** It exists so the graph can leave the app
and so the layout can be nudged. It is not saved and is not a file format the app owns.

---

## 2. The shape of the view

```
#output
  ├─ layout config block     (contenteditable, layout options as key: value lines)
  ├─ toggle: code | chart    + the property pickers + the graph checks
  └─ either the mermaid code block  (step 1, built)
     or     the SVG canvas          (steps 3-6)
```

**Four property pickers**, each a `<select>` over the registered properties:

| picks | default | what it must be |
|---|---|---|
| link source | `internalLink` | a list property |
| link text | `internalLinkText` | a list property, read index-aligned with the link source |
| node text | `title` | any property |
| node shape | *(none)* | any property; no selection means every node is `()` |

The defaults are what step 1 already emits. A picker pointed at a property holding the wrong shape is
the user's business, exactly as a column type is — an unusable choice makes an odd-looking chart, not
an error.

**The shape picker is a second channel, not a story feature.** Any graph has node kinds worth telling
apart at a glance, and shape is simply a dimension the map has going spare. It deliberately reads *any*
property rather than a convention the app invents: **`color` and `tags` already mark kinds** and work
without this, so the picker adds a way to show a distinction the notes already carry — it does not ask
for a new one to be created.

---

## 3. Where the links and the link text live

**Front matter, not the body prose.** The reason came from the motivating case and generalises
straight away: these files are built into a site with Eleventy, where the body is the text that becomes
the page and the links are navigation the template renders separately. An inline `[[cave.md|push the
door]]` would have to be stripped back out of the prose it is trying to render.

That is true of any pipeline that treats a note's body as content and its links as structure — a
runbook rendering steps, a docs site building a nav tree. Front matter is where structure lives; the
body is where the writing lives.

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
edited by hand, with nothing to keep them honest: delete one entry from one list and every label after
it silently attaches to the wrong link.

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
stored. One rule if it is built: **split on the first pipe only**, so link text containing one survives.

**The list-of-maps form — the one that reads best — is not available.** Tested, not assumed:

```yaml
choices:
  - to: cave.md
    text: push open the heavy door
```

gypsum's YAML parser refuses it, with `list item holding a key is not supported` and `key inside a
list is not supported`, so every node's note would carry a load error. It needs the parser to grow
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
branching story, a choice pointing at a scene not yet written, which is a thing people do on
purpose in any graph they are still building — and it covers anything typed by hand. The degradation is the feature.

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

**dagre** is the right size and does layered layout well. It has no edge merging at all, so a graph
where convergence wants tidying can never be given it — five nodes arriving at one hub always draw as
five separate arrowheads into one box, and that is the *only* rendering on offer. It also routes only
polylines, and routes back edges — which any graph with a loop has — as long swoops across the
diagram.

**The point is not that merging looks better. It is that it has to be available** (§5.5): it is the
right answer for some graphs and the wrong one for others, so the engine has to be able to do both.
elkjs can, at 1.6 MB; dagre can only ever do one of them.

**So the choice was 1.6 MB for the option, or 48 KB without it.** Writing it gives both, and edge
merging is not a standard algorithm anyone would be reusing anyway: it is a custom pass ELK bolted on,
and roughly 45 lines to do ourselves — which is also what makes it cheap to switch off.

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
- Roughly eight options (§5.4), not 235 — of which one, `mergeEdges`, is a real choice (§5.5)
  rather than a number to tune.

### 5.4 The config block

One `key: value` per line, not JSON — the block is typed into by hand and a missing brace should not
lose the lot:

```
direction: down
layerGap: 70
nodeGap: 40
mergeEdges: off
labelPlacement: segment
maxNodeWidth: 220
```

`services/flowchart/layout-options.js` holds the allowed keys, their types and their defaults, and
**an unknown key is dropped rather than honoured** — the rule `table_layouts.gypsum` already follows
for a hand-edited type name, and for the same reason: a typo must not invent behaviour. Dropped keys
are named in the report line, via the existing `output-report.js`.

### 5.5 Edge merging is a choice, not an improvement

`mergeEdges` is the one option here that is a genuine aesthetic fork rather than a number to tune, and
it is worth saying why it is not simply switched on.

**Merged**, the edges arriving at a node meet at a junction a gap above it and enter as one trunk. It
is tidier at high fan-in and it makes the *node* the thing you read — "everything ends up here".
**Unmerged**, every edge runs its own path to its own arrowhead. It is busier, and it keeps every edge
traceable end to end — you can follow one link from its source to its target without losing it in a
shared trunk.

Which is better depends on the graph, and on two things in particular:

- **Fan-in.** At two or three inbound edges, merging buys tidiness nobody needed and costs
  traceability. At ten, unmerged is a thicket.
- **Whether the edges carry labels.** This is the one that flips the answer, and it works against the
  case that prompted the view: with a label on every edge, a merged trunk makes it genuinely harder to
  tell which label belongs to which incoming path, because the labels sit on branches of a shared
  stem. A graph with labelled edges probably wants merging *off*.

So: **`mergeEdges: off` is the default**, because unmerged is the honest drawing and merging is the
stylistic choice made on purpose. The pass is `merge-edges.js` (§5.2) and it simply does not run.

The obvious refinement, and barely more code than the boolean, is to make it a **fan-in threshold** —
`mergeEdges: 4` meaning "merge only where four or more edges arrive", so a quiet part of the graph
stays traceable while a hub gets tidied. Worth doing once there is something to look at; §11's spike
should show both modes on the same graph so the default can be chosen from evidence rather than taste.

---

## 6. Measuring and drawing

### 6.1 Node sizes

The engine needs `width` and `height` per node before it can place anything.

**Measure the text, do not estimate it from length.** With proportional fonts `WWWWW` and `iiiii`
differ about threefold, so estimated boxes would clip labels and gape in the same chart. One
`CanvasRenderingContext2D`, reused across the render with its `font` set from the computed style of
the node class, measures a label in microseconds. `services/flowchart/measure-label.js` wraps to
`maxNodeWidth` and returns the box — and **returns the wrapped lines too**, so the measurement and the
drawing cannot disagree. A non-rectangular shape — a rhombus, say — needs more box than its text, so
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
3. **Click an edge to write its label.** Writes the link-text property — ordinary front
   matter, so `applyCellEdits` already does it. §13.2 is the catch.
4. **Drag node → node to add a link.** Appends to the link-source list of the drag-start note, and
   a matching entry to the link-text list. Two lists to keep in step, which is §3.1's argument
   restated as code.
5. **Drag node → empty space to create the next note.** The gesture that grows the graph:
   `createEmptyNote()` makes the file, then the link is added as in 4, then the new note opens.
   §13.5 is the naming problem.

**All of these are front-matter writes**, which is the happy consequence of §3 — no body writer is
needed, and `applyCellEdits`/`applyRawEdits` already splice a YAML value span without disturbing the
rest of the file.

---

## 8. The graph checks

The thing a map is *for*, beyond looking at. None of it is layout; all of it is a walk over the parsed
graph, and it is cheap once the graph exists. **Each is a plain graph property, not a story concept** —
which is why they survive the generalisation test intact and only their names needed changing.

| check | the graph question | what it catches |
|---|---|---|
| **unreachable** | no path from any root reaches this node | a note nothing leads to: a scene the reader can never see, a runbook step no branch arrives at, a page absent from the nav |
| **leaf** | no outgoing links | the end of a path — an ending, a terminal step, or a note somebody forgot to finish |
| **broken** | a link naming no loaded file | already found by `file-errors.js` (`linkSegment`) and surfaced as `errorOnLoad`, so this is drawing what the app already knows |
| **roots** | no incoming links | where the graph starts. One root is the ordinary case; several is worth saying, because it usually means either several entry points or a node that got detached |

**A leaf is not an error and must not be drawn as one.** In one graph it is a finished ending, in
another an unwritten branch, and the app cannot tell which — so it marks and counts them, and the
person decides. The same goes for several roots.

Each check marks its nodes in the SVG and reports a count in the line above the list, via the existing
`output-report.js`. **Nothing is auto-fixed.**

Deliberately absent: any notion of a node *kind* the app defines. Marking a leaf as "a real ending"
rather than an unfinished one is what `color` and `tags` are already for (§2), and inventing a
`nodeType` convention would be the app asking for a vocabulary it does not need.

---

## 9. Where the code goes

| Path | |
|---|---|
| `public/js/services/flowchart/parse-mermaid.js` | text → `{direction, nodes, edges}` |
| `public/js/services/flowchart/measure-label.js` | label + shape → wrapped lines and box |
| `public/js/services/flowchart/layout-options.js` | config block text ↔ validated options |
| `public/js/services/flowchart/layout/*.js` | the nine passes of §5.2 |
| `public/js/services/flowchart/graph-checks.js` | §8, a walk over the graph |
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
  crossings, placement — as a throwaway outside the repo, feed it a real graph of 40-60 nodes with
  the convergences and the loops back that §1 describes, and *look at it*. §11 is the standard it has
  to meet. Nothing else here is worth building until this has been seen.
- **Step 3 — the UI frame.** *Pickers built; config block and code/chart toggle unbuilt.* §16.
- **Step 4 — identity comments and the parser.** The `%%` lines and `parse-mermaid.js`. The test is
  that parsing the app's own output reproduces the graph it came from.
- **Step 5 — first chart.** The engine moves into the repo, plus routing, merging, labels and the SVG.
  No interaction.
- **Step 6 — pan, zoom, click-to-open.** Read-only. The view becomes genuinely useful here and could
  reasonably rest a while.
- **Step 7 — the graph checks.** §8. Cheap, and the highest value per line in the whole plan.
- **Step 8 — the writes.** Edge text, then drag-to-link, then drag-to-create.
- **Step 9 — the one-list choice format.** §3.1, and migrating to it.

---

## 11. How step 2 is judged

Vague acceptance criteria are how a spike gets waved through. These are the ones that matter, in
order:

1. **No edge crosses another where a human would obviously not draw it so.** A few crossings in a
   branching graph are unavoidable; a tangle is the failure.
2. **A linear run of nodes draws as a straight vertical line.** If the spine zigzags, coordinate
   assignment is not good enough and the map is unpleasant to read. This is the pass most likely to
   disappoint.
3. **Convergence looks deliberate** — five edges into one node read as a fan, not a mess. **Judged in
   both merged and unmerged modes** (§5.5), on the same graph, since the point of the option is that
   neither is universally right.
4. **The back edges are visible as back edges** and do not cross the body of the diagram.
5. **It fits on a screen at a sensible zoom** for 40-ish nodes.

Judged on screenshots of a real graph, not a synthetic one — a generated graph has none of the
convergence that makes this hard, and will flatter the engine.

**If it fails**, the retreat is dagre for passes 1-5 with our own routing and merging on top. It is
explicitly *not* the plan and not the thing to design for — naming it here so that a disappointing
spike is a decision rather than a surprise.

---

## 12. What v1 knowingly does not do

- ~~No sub-graphs, chapters, or grouping by folder or tag.~~ **Built** — the subgraph role groups
  nodes by any property, a tag included. See §16.
- No saved chart: the pickers and config are session state (§14.4), the mermaid text is scratch.
- No node dragging to reposition — the engine owns placement, and a hand-placed node would be lost at
  the next layout with nowhere to persist it.
- No deleting a note or a link from the canvas. Removing an edge means removing a value from a file,
  and a drag that silently unlinks two notes is the one gesture here that could lose work.
- No mermaid feature the app does not itself emit.
- No walking the graph in-app — following links as a reader would, rather than looking at the map.
  Tempting, and a different plan.

---

## 13. Problems

### 13.1 The engine might not look good enough

The honest one. Crossing reduction and coordinate assignment are where naive implementations show,
and the failure is very visible: needless crossings and zigzagging spines. The classic trap is that it
looks fine on an eight-node test and falls apart at sixty. That is exactly why §10's step 2 comes
before everything and why §11 is written down in advance.

Mitigating it: the graphs §1 describes are the *easy* case — small, mostly acyclic, mostly shallow —
and the passes that are hardest to get right are the ones that matter most on the graphs we are
deliberately not drawing.

### 13.2 Two lists that must stay in step

`internalLinkText[n]` labels `internalLink[n]`, with nothing enforcing it. Hand-edit one list and
every choice after the edit attaches to the wrong door — silently, because both lists are still valid.

The payload is text somebody wrote and will be read, so a silent mis-attachment is worse than a
missing one. §3.1 is the answer and it is deferred to v2; until then the flowchart's own writes must
update both lists together, and §8 should carry a fifth check for a length mismatch between the two.

### 13.3 Pagination makes a graph that is not true

`renderFiles` computes a 50-file page for every view and appends the nav unconditionally. In a table
that is just the next rows. In a map, a link leading to a note on another page becomes an orphan
node — the map shows a fragment while looking whole, and §8's reachability check would be answering
about the page rather than the graph. §14.3.

### 13.4 The round trip fights itself

Parsing the mermaid so hand-edits survive, and writing to files from the chart, are in conflict: every
write re-renders and regenerates the text. Edit the layout, drag one choice, and the edits are gone.
No merge is available once the text has been retyped. §14.1 takes the honest version.

### 13.5 A drag that ends in a prompt is a poor gesture

Drag-to-empty-space has to name a file, and stopping the gesture to open a modal breaks it. An
auto-named note opened straight into the editor is probably better than asking, since the person is
about to write it anyway and can rename from the table.

### 13.6 Smaller things

- **View transitions.** The flowchart renderer emits no `data-vt-id`, so `renderFiles` sees "nothing
  matches" and starts a transition on every render. Crossfading a whole SVG re-layout for a second is
  not wanted; it needs to opt out.
- **Re-layout on every keystroke** in the code block would parse and lay out per character. On blur,
  or debounced, never on input.
- **Node shapes need a mapping** from a property value to a shape name, with an
  unknown value falling back to `()`.
- **`title` is read-only**, being derived from the `# heading`, so node text cannot be edited from the
  map. Correct, and worth knowing before someone tries.
- ~~**Nowhere to persist the pickers or the config.**~~ **Settled the other way** — the pickers live
  in `table_layouts.gypsum` beside `propertyTypes`, which was already a thing in that file belonging
  to the folder rather than to a layout. The config block of §5.4 is still unbuilt and still has
  nowhere. See §16.

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
graph §1 describes is bounded by what a person wrote, so there is no cap worth enforcing; a folder
large enough to be slow is not one graph, and filtering is the honest answer.

### 14.4 Session state, and revisit it

*Superseded for the pickers by §16.* They are `appState.flowchartOptions`, and they are written to
`table_layouts.gypsum` the moment they are set. The argument below was that retyping them every
session would be the evidence they wanted a file; the counter-argument, which won, is that the file
already held `propertyTypes` — a fact about the folder rather than about a layout — so there was a
place for them and a validated writer to reach it with.

~~Pickers and config live in `appState.flowchartState`, lost on reload, exactly as `viewState` is.
Retyping the same options every session is the evidence that they want a file — and by then the view
will have said what else belongs in it.~~

---

## 15. Open questions

1. **Is there a real graph to test against?** Step 2's judgement depends on it, and a generated graph
   will flatter the engine by having none of the convergence that makes layout hard. The branching
   story is the obvious candidate; anything with the §1 shape would do.
2. **Does the mermaid round trip still earn its keep?** It was designed before the purpose was stated.
   Someone working in the files may only ever want the export, in which case §4's identity comments
   stay but §14.1's detached state could go, and the plan gets simpler.
3. **Loops back — as edges, or as something else?** An edge running up the whole diagram is honest but
   noisy, and some tools draw it as a labelled stub instead. Worth deciding at step 5, once there is
   something to look at.
4. **Should §8's checks be available outside this view?** They are a walk over the link graph and have
   no dependency on the SVG — "which notes does nothing link to" is a question worth answering in the
   table too. If so, `graph-checks.js` belongs in `services/` proper rather than under `flowchart/`.

---

## 16. What step 3 actually built

The pickers, a fifth role the plan did not have, and a home for the choices. Not the config block
and not the code/chart toggle — those still wait on the engine.

**Five roles, not four.** §2's table, plus **subgraph**: the property whose value groups nodes into
`subgraph … end` blocks. A list value uses its first item, because mermaid puts a node in one
subgraph and no more, and `tags` works like any other property — it is a Map, and its keys are the
tag names.

**Node shape landed as a fixed vocabulary**, which §13.6 asked for and did not choose. `NODE_SHAPES`
in `constants.js` is the only place a shape is legal, and a note names one by word (`diamond`), by
both marks (`"{}"`) or by the opening mark (`"{"`) — three spellings derived from the two
delimiters, so a shape added later brings its symbol forms with it. Anything else draws round, which
is §2's rule that a badly-pointed picker makes an odd chart rather than an error.

**The generator is two passes, and that is the subgraph tax.** Mermaid puts a node in the first
subgraph it is *mentioned* in, so an edge written inside a block drags its target in. Every node is
therefore declared before any edge — `services/flowchart/mermaid-source.js`, one code path whether
or not anything is grouped.

**A connector item is read through `linksInText()`.** `internalLink` holds stripped targets, but a
property the user points the role at holds `"[[cave.md]]"` as the note wrote it; without reading the
brackets the whole chart drew as unresolved nodes. The link's own `|label` is ignored — labels come
from the connector text role and nowhere else, so there is one labelling story. §13.2's alignment
risk is unchanged and is now wider: two unrelated properties need not even be the same length.

**§13.6's view-transition opt-out is built**, because the options dialog made it felt — every close
re-renders, and the flowchart emits no `data-vt-id`, so every close crossfaded the whole page for a
second. One condition in `a-render-all-files.js`.

Still open from §13.6: node shapes needed a mapping and now have one; `title` is still read-only;
re-layout on keystroke is not a question yet.
