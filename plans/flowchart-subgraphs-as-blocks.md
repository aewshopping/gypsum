# Plan: flowchart — each subgraph laid out on its own, as a block (ELK's way)

Status: **written up, not started, not decided.** The owner is trying the current layout over time
before deciding whether this is worth building. Nothing here has been implemented; everything marked
*measured* below was run against the code as it stood at manifest 1.398.0.

Follows `plans/completed/flowchart-dagre-elk-layout.md` (the layout as built) and
`plans/completed/flowchart-vertical-alignment.md` (boxes stay where dagre puts them, sibling order,
symmetry). Read both first, and CLAUDE.md's *The flowchart's layout*. This plan **reverses one rule
there** — "Subgraphs are placed by dagre, in the same run … One run, never one per group" — and says
why in §2.

---

## 1. What this delivers, and what it does not

**The problem.** A chart with subgraphs comes out wider than it needs to, and loose inside each
subgraph. dagre's compound ("subgraph") mode runs its sideways placement (Brandes–Köpf) four times and
averages them; in each run, whatever is not being lined up is **pushed out against the subgraph's
walls**, and a subgraph is as wide as its widest row. The average then lands things far out.

*Measured* on the reference chart (`plans/reference/flowchart-layout-mockup-2-vertical-alignment.png`,
rebuilt as the `REFERENCE` fixture in `tests/2-behaviour/62-flowchart-layout.spec.js`), offset from
001's centre of 002 and of the `try to fix` lane:

| Placement | 002 | `try to fix` lane |
|---|---|---|
| ELK, mermaid's settings | −81.5 | +82 |
| dagre, no subgraphs | +74 | −74 |
| dagre compound (what gypsum runs) | −285 | +363 (mirrored to +285 by `straighten.js`) |

Each of dagre's four alignments, compound on: `UL` put the lane at +858 against the right wall
(+915); `UR` put 002 at −628 against the left wall (−739). Off: 0 / ±148. So the width is the walls.

*Measured*, whole-chart width with and without subgraph mode, same notes and links:

| Fixture | With subgraphs | Without | Extra |
|---|---|---|---|
| mockup, two subgraphs | 968 | 783 | +24% |
| mixed (kitchen, garden) | 721 | 596 | +21% |
| alignment reference | 842 | 783 | +8% |
| mockup, one subgraph | 842 | 783 | +8% |

(Some of the extra is the groups' own padding, which any approach keeps.)

**What this plan delivers.** Inside a subgraph, everything the ungrouped chart already has — chains in
columns, a note centred over its branches, narrow symmetry, the note's own sibling order — because the
inside is laid out with **no walls**. Charts with subgraphs get narrower. Subgraphs read as **blocks**,
as mermaid draws them.

**What it gives up.** Rows no longer carry across a subgraph's border. Today a note outside a group can
sit level with a note inside it (in the mixed chart, *Shopping* is level with *Chop onions*). After
this, a subgraph is one box in one row of the chart around it: notes outside sit above, below or beside
the whole block, never beside one of its inner rows. Charts with subgraphs get **taller**. That is
exactly what mermaid's elk renderer does (§2.3) and is the look being aimed at, but it is a change of
look, not only a narrowing.

**What it does not touch.** Charts with no subgraph: their path is unchanged, line for line. The
layout contract (`layout/placeholder-layout.js`) — so drawing, hover, press, drag, link writing,
settling after a write (`flowchart-settle.js`), pan and zoom memory: none of them change.

**Cheaper alternative, recorded so it is not lost.** "Option 1": lay the chart out once more without
subgraphs, fit each group's box round its members, and use that only if no non-member, lane or label
falls inside any group's box and no two boxes overlap; else today's layout. ~50–70 lines. Gets the
reference chart exactly right (groups stacked as bands) but falls back to today's look whenever groups
interleave with outside notes — which grows likelier the more groups and cross-links a folder has.
Never worse than today.

---

## 2. How ELK does it — read from its source

### 2.1 Where the source is

- mermaid.live draws its elk charts with `@mermaid-js/layout-elk` (1.0.1), whose `dist/` ships the
  adapter **unminified**: `dist/chunks/mermaid-layout-elk.core/elk-*.mjs`. The settings it hands ELK
  are in `createRootElkGraph`, `buildSubgraphLayoutOptions` and `ELK_PRESETS` (default preset:
  Brandes–Köpf, `fixedAlignment: BALANCED`, network-simplex layering, depth-first cycle breaking;
  `hierarchyHandling: INCLUDE_CHILDREN`; `mergeHierarchyEdges: true`; subgraph `spacing.baseValue` 24,
  `nodeNode` 50, padding 24). Fetch: `https://registry.npmjs.org/@mermaid-js/layout-elk/-/layout-elk-1.0.1.tgz`.
- It depends on `elkjs` ^0.9.3 (GWT-compiled Java). Runnable in node for experiments:
  `https://registry.npmjs.org/elkjs/-/elkjs-0.9.3.tgz`, `require('./package/lib/elk.bundled.js')`.
- ELK's Java source: Maven Central source jars (GitHub's archive download is blocked from the session
  container; Maven is not), e.g.
  `https://repo1.maven.org/maven2/org/eclipse/elk/org.eclipse.elk.alg.layered/0.10.0/org.eclipse.elk.alg.layered-0.10.0-sources.jar`
  (also `org.eclipse.elk.core`, `org.eclipse.elk.alg.common`). 0.10.0 was read; mermaid bundles 0.9.3,
  close enough for how hierarchy is handled.

### 2.2 What it does with a subgraph (`org.eclipse.elk.alg.layered`)

1. **`ElkLayered.doCompoundLayout`** is the entry for `INCLUDE_CHILDREN`
   (`LayeredLayoutProvider.layout`).
2. **`compound/CompoundGraphPreprocessor`** first **splits every link crossing a subgraph's border**
   into "hierarchy-local edge segments": the subgraph's node gets an *external port* on its border, and
   inside the subgraph a dummy node stands for the outside end. In its own words: "the algorithm
   replaces cross-hierarchy edges by hierarchy-local edge segments".
3. **The stand-in sits in a row of its own at the top or bottom** of the subgraph's layout:
   `graph/LGraphUtil.createExternalPortDummy` gives a `WEST` port's dummy
   `LayerConstraint.FIRST_SEPARATE` and an `EAST` port's `LAST_SEPARATE` (ELK lays out left to right
   internally; top to bottom is that rotated, so in our terms: links in → a first row, links out → a
   last row).
4. **A link's centre label goes on its "shallowest" segment** — the outermost piece —
   (`moveLabelsAndRemoveOriginalEdges`, `EDGE_LABELS_PLACEMENT` `CENTER` → `getShallowestEdgeSegment`).
5. **`ElkLayered.hierarchicalLayout` lays every graph out bottom-up**, innermost first
   (`collectAllGraphsBottomUp`), each with the **whole pipeline of its own**: rows, order, sideways
   placement, routing. So **Brandes–Köpf runs on a subgraph's contents alone — no walls.**
6. **`intermediate/HierarchicalNodeResizingProcessor`** then sizes the subgraph's node to fit what it
   holds ("resizes a child graph to fit the parent node"). In the graph around it, the subgraph is **one
   node of that size**, placed like any other.
7. **The border ports are fixed where the inside put them** (`HierarchicalPortPositionProcessor`,
   `HierarchicalPortConstraintProcessor`, `HierarchicalPortOrthogonalEdgeRouter`), and the outside
   routes to them.
8. **Only one step works across the whole hierarchy: crossing reduction.**
   `p3order/LayerSweepCrossingMinimizer` is the only `IHierarchyAwareLayoutProcessor`; its sweeps run
   through every level, so the order of a subgraph's stand-ins agrees with the order of the things they
   connect to outside — no crossings at the border. Everything else runs per graph.
9. `postCompound` — `compound/CompoundGraphPostprocessor` joins the split segments back into one route.

### 2.3 What that looks like (*measured*: elkjs 0.9.3, mermaid's settings, the mixed chart)

```
start    x 372..524  y  12..76
plan     x 115..267  y 178..242        shop  x 372..524  y 178..242
kitchen  x 252..496  y 354..636        garden x 12..212  y 439..551   ← one row, side by side
   chop  y 378..442;  cook y 548..612     weed  y 463..527             ← lines up with neither
eat      x 320..472  y 748..812
```

`kitchen` and `garden` are two boxes in one row of the outer chart, `garden` centred vertically against
`kitchen`. Notes outside sit in the rows above and below the blocks. That is the look this plan
produces.

### 2.4 Why the old "one run, never one per group" rule no longer holds

It was written because separate runs would leave links between groups unplanned. ELK's answer is the
split (§2.2 items 2–4, 7, 9): the link is planned in pieces — inside each group to a stand-in on the
border, and outside between the group boxes — and stitched. The rule's worry was real; the split is
what answers it.

---

## 3. The design for gypsum

### 3.1 Shape of the pipeline

`dagreLayout()` (`layout/dagre-layout.js`) gains one branch: **if no charted box has a group, nothing
changes.** Otherwise:

```
boxes, edges
  │  split-links.js        collapse each group to one box; cut every cross-border link into pieces
  ├─ outer graph           ungrouped boxes + one box per group; outer links (and outer pieces)
  │    upward-links on the OUTER graph first  → decides, per cut link, whether it leaves a group
  │                                             through its top or its bottom (see 3.3)
  ├─ for each group:       inner layout (chartInRanks, no compound) of its members, plus stand-ins
  │                        pinned to a top row (links in) / bottom row (links out)
  │                        → the group's size, and each stand-in's x on its border
  ├─ outer layout          chartInRanks with each group as a box of that size, its ports FIXED at
  │                        the stand-ins' x
  └─ stitch-routes.js      translate each inner chart into its box; join inner piece + outer piece
                           (+ the other group's inner piece) into one route per original edge;
                           groups from the boxes; then hops, frame and unlinked block as today
```

The contract out of `dagreLayout()` is exactly as today: `positions`, `routes` (one per edge, in edge
order, `{points, labelAt, hops}`), `groups` (`{name, x, y, width, height}`), `width`, `height`.

**No dagre compound mode anywhere** in the new path. Every dagre run is a plain graph, which is the
mode §1 measured as narrow and symmetric.

### 3.2 Splitting links (pure)

Per original edge (after loops are set aside as today — a loop stays inside its own graph):

| Ends | Pieces |
|---|---|
| both ungrouped | one outer link |
| both in group G | one inner link of G |
| u in G, v ungrouped | inner u → stand-in(G, edge) ; outer box(G) → v |
| u ungrouped, v in G | outer u → box(G) ; inner stand-in(G, edge) → v |
| u in G, v in H (H ≠ G) | inner u → stand-in(G) ; outer box(G) → box(H) ; inner stand-in(H) → v |

- **The label goes on the outer piece** (ELK's "shallowest segment", §2.2 item 4). An inner piece is
  unlabelled.
- **One stand-in per cut edge per group.** (mermaid sets `mergeHierarchyEdges: true`; see 3.7 for
  merging.)
- Stubs (notes that do not exist yet) are ungrouped, as today (`flowchart-graph.js`).
- Unlinked notes **inside** a group are inner boxes (today's compound run already keeps them inside);
  unlinked ungrouped notes go to `unlinked-block.js` as today.

### 3.3 Which way a cut link leaves a group — the order of decisions matters

A link from member u of G to outside note A leaves G **through its bottom if A is below G, through its
top if A is above** — and which is which is only known once the outer graph's loops are broken. So:

1. Build the outer graph (groups collapsed) and run `upwardLinks()` (`layout/upward-links.js`) on it.
   This is the only place the turning of a cut link is decided.
2. A cut link's piece inside G then goes: to a **bottom** stand-in if, after turning, box(G) is its
   *upper* end in the outer graph; to a **top** stand-in if box(G) is the *lower* end.
3. Inner links (both ends in G) are turned by `upwardLinks()` run on G's inner graph, independently.

**Tricky: collapsing creates new loops.** A → u and w → A, with u and w both in G, become A → G and
G → A in the outer graph: a loop that did not exist at note level. `upwardLinks()` already handles
loops, so nothing new is needed — but a test should hold it (§6).

**Tricky: a link from a group to itself in the outer graph** cannot arise (both ends in G is an inner
link), so the outer graph never has a self-loop from collapsing.

### 3.4 Pinning stand-ins to the top or bottom row

ELK uses layer constraints (`FIRST_SEPARATE`/`LAST_SEPARATE`). **dagre has none**, but it honours an
edge's `minlen` — *measured*: with `a → b → c` and `a → exit` at `minlen: 3`, `exit` landed in a row of
its own below `c`. So, per group:

1. Lay the members out once without stand-ins (`placeWithDagre` on the inner graph) to learn each
   member's row, and the top and bottom rows.
2. Add each stand-in with its edge given `minlen` = the rows between its member and the top (for an
   entry) or bottom (for an exit), plus one. A stand-in is a leaf, so network simplex leaves it exactly
   `minlen` away: it puts no pull on the members' rows.
3. Lay out again with the stand-ins. (This is the third dagre run for a group with ≥3-branch sibling
   ordering, since `sibling-order.js` already lays out twice. Groups are small; acceptable, but measure
   on a 300-note folder — §7.)

**Tricky: dagre doubles rows when there are labels** (`makeSpaceForEdgeLabels` halves `ranksep` and
doubles every `minlen`). Read rows from `rankBands()` (`layout/ranks.js`) on the first run and set
`minlen` in the same units dagre was given; check with a labelled fixture that stand-ins really land on
the outermost row.

**Stand-in size.** Width 0, height 0. Its row then doubles as the group's top or bottom padding, and
its y *is* the border. A group with no stand-ins on a side gets fixed padding there instead (mermaid
uses 24).

### 3.5 Group size and its name

- **Width**: the inner chart's width (as `atOrigin()`/`compactColumns()` already return it) plus
  padding each side.
- **Height**: `GROUP_NAME_HEIGHT` (the strip `dagre-layout.js` keeps inside a group's top edge for its
  name) + the inner chart's height + padding where there is no stand-in row.
- The inner chart is translated to sit below the name strip. The existing checker already forbids
  anything in that strip, including a horizontal run (`checkLayout`/`checkRoutes` in the spec).
- **Left to right** needs nothing new: the whole of this happens inside the top-to-bottom pipeline on
  sideways boxes, and `mirrored()`/`withNamesAbove()` (`transpose.js`, `chart-frame.js`) run on the
  result as today.

### 3.6 Fixed ports on a group's box

The outer layout treats box(G) as an ordinary box, except where its links meet it: **at the x of the
stand-in each one came from**, not divided evenly. `ports.js` (`assignPorts`) gains an optional
`fixed: Map<linkIndex, {upper?: x, lower?: x}>` that overrides the even division for those ends; a side
mixing fixed and free ends spreads the free ones over what is left. `straighten.js` and
`orthogonal-routes.js` need nothing: they already take the port's x as given, and `NUDGE` only ever
moves a port by ≤5 to meet a lane — **it must not move a fixed port** (pass the fixed set through as
`upperShared`/`lowerShared` already does for merged ports, which is the same "this port stays put"
answer).

### 3.7 The hard part: the order of the stand-ins along a border

ELK makes this its one cross-hierarchy step (§2.2 item 8). If G's bottom stand-ins are in one order and
the notes they lead to outside are in another, the routes cross just below G's border.

**Proposed approximation, two passes:**

1. Lay out every group's inside with stand-ins in dagre's own order; lay out the outer graph with fixed
   ports.
2. For each group, re-order its stand-ins row by the outer x of each one's far end (for an exit: where
   its outer piece goes; for a through-link G → H: H's port), using `customOrder` exactly as
   `sibling-order.js`'s `inNoteOrder()` does — swap the stand-ins among the positions they hold, and
   move each one's placeholder nodes with it. Lay the group out again, then the outer graph again.
3. Keep the second result only if it crosses no more lines (`crossings()` in `sibling-order.js`), the
   same guard sibling order already uses.

**Merging** (`flowchartLayoutSetting('merge')`): mermaid merges hierarchy edges into one port per
source. Simplest first version: under merge, one stand-in per (member, side) rather than per edge, and
the outer side treats that group port as shared (`upperShared`/`lowerShared`). Decide after stage 3 is
seen by hand.

### 3.8 Stitching routes

For each original edge, its pieces' routes (each already `[x, y]` polylines from `chartInRanks`) are
translated into the chart's coordinates and joined end to start. Because the stand-in has zero size and
the outer port is fixed at its x, **the joins coincide** — an inner exit piece ends at (sx, groupBottom)
and the outer piece starts at (sx, groupBottom). Drop the duplicate point; merge collinear runs.
`labelAt` comes from the outer piece. `routeHops()` (`line-jumps.js`) runs once on the joined routes, as
today. Turned links: each piece is turned back by its own graph's `chartInRanks` already, so a joined
route reads from the original `from` to `to` — but **check the piece order** for a link that was turned
in the outer graph (its outer piece runs box(G) → A while the original runs A → u).

### 3.9 What can be removed once this is the only path for groups

Nothing calls dagre's compound mode any more, so these become dead and should go in the last stage
(keeping the code honest, and making the net change smaller):

- `dagre-place.js`: `groupKeys`, `compound: true`, `setParent`, the `groups` it returns.
- `ranks.js`: the group border rows in `rankBands()`.
- `close-row-gaps.js`: `contentsOf`, `groupBounds`, `fitGroup`, `besideOf` — group walls inside one
  layout no longer exist.
- `straighten.js` `laneFree()`: the group-edge check.
- `dagre-layout.js` `chartInRanks()`: the `groups` mapping through `down()`.

---

## 4. Where the code goes

| File | New / changed | What | Lines (est.) |
|---|---|---|---|
| `layout/split-links.js` | new, pure | Groups collapsed to boxes; each edge cut into pieces (3.2); which side a piece leaves by, given the outer turning (3.3) | 70–90 |
| `layout/nested-layout.js` | new, pure | The orchestration in 3.1: inner layouts (two runs each for `minlen`, 3.4), group sizes (3.5), outer layout with fixed ports, the second pass for stand-in order (3.7) | 90–120 |
| `layout/stitch-routes.js` | new, pure | Inner charts translated into their boxes; pieces joined into one route per edge (3.8); `groups` built | 50–70 |
| `layout/dagre-layout.js` | changed | The branch: grouped → `nestedLayout`; `chartInRanks` takes `fixedPorts` and `minlen`s through to `placeWithDagre`/`assignPorts` | +15 |
| `layout/dagre-place.js` | changed | Edge `minlen` passed through; later, compound code removed (3.9) | +10, −20 |
| `layout/ports.js` | changed | Fixed ports (3.6) | +15–20 |
| `layout/sibling-order.js` | changed | `inNoteOrder` generalised, or a sibling `standInOrder` beside it (3.7) | +20–30 |
| `layout/ranks.js`, `close-row-gaps.js`, `straighten.js` | changed | Group code removed (3.9) | −50 to −80 |
| `tests/2-behaviour/62-flowchart-layout.spec.js` | changed | Fixtures and assertions (§6) | +80–120 |
| `tests/3-occasional/62-flowchart-layout-look.spec.js` | changed | Screenshots of the grouped fixtures already there; one more with three linked groups | +20 |
| `CLAUDE.md` | changed | *The flowchart's layout*: rewrite "Subgraphs are placed by dagre, in the same run…"; add the split, stand-ins, fixed ports; file map rows for the three new modules | — |

**New code: about 300–400 lines** in modules, **plus 100–140 lines of tests**; **50–100 lines removed**
in the last stage. Net growth of the layout (about 1,600 lines today) roughly 250–300.

---

## 5. Stages — stop after each and try it by hand

As the layout plan was built: each stage ends with the look spec's screenshots compared by eye with the
reference pictures, and the next starts only once that has been tried. Bump the manifest's minor version
with each stage that changes code.

0. **Baseline.** Add the fixtures of §6 to the spec and the look spec *before* any change, so every
   later stage is compared with today's pictures. No code change.
1. **Split, with the old layout still drawing.** `split-links.js` and its node tests only. Nothing
   calls it yet.
2. **Inner layouts.** Each group laid out alone with stand-ins pinned top and bottom (`minlen`). A node
   test that every stand-in is on its group's outermost row, labelled links included.
3. **Outer layout and stitching — the first visible stage.** Fixed ports, `nested-layout.js`,
   `stitch-routes.js`, the branch in `dagreLayout()`. Stand-ins in dagre's own order. Every existing
   grouped fixture must still pass `checkLayout`/`checkRoutes`. **Pause:** try real folders with
   several linked groups; look especially at crossings just outside a border.
4. **Stand-in order** (3.7), with the crossing guard. **Pause.**
5. **Merging** under the merge setting (3.7). **Pause.**
6. **Remove compound code** (3.9) and update CLAUDE.md. Full suite once (`npm run test:all`).

---

## 6. Testing

**The existing checker is most of the safety net, and it already states the group rules** (in
`checkLayout`/`checkRoutes`, `62-flowchart-layout.spec.js`): every group holds its members and nothing
else; groups do not overlap; nothing lands in a group's name strip; no horizontal run crosses a name
strip; **a route crosses a group's border only to reach or leave a member, and then exactly once** —
that last one is the stitching's acceptance test as it stands. Every fixture runs top to bottom, left to
right and merged.

New, level 2 (node tests, milliseconds):

- **`REFERENCE` in two groups** (already a fixture): 002 and the `try to fix` lane within a few units of
  ±(half 002 + spacing + half label)/2 of 001's centre — i.e. narrow, as ELK's ±82 and plain dagre's
  ±74 — not today's ±285.
- **Collapsing makes a loop** (3.3): A → u, w → A with u, w in G. Lays out, passes the checker.
- **A link passing through two groups**: u in G → v in H, with G and H in different rows. One route,
  crossing G's border once and H's once.
- **Labelled stand-in rows** (3.4): a group whose links carry labels; every stand-in on the outermost row.
- **Fixed ports** (3.6): the outer route meets the group box at exactly the stand-in's x.
- **Width does not grow**: for each grouped fixture, the chart is no wider than today's — the baseline
  from stage 0. (Height may grow, by design.)
- **Charts without groups unchanged**: a fixture's layout byte-for-byte equal before and after the
  branch — guards that the ungrouped path really is untouched.

Level 1: nothing — no part of this writes a note.

---

## 7. Risks and open questions

- **Taller charts.** By design (§1), but worth seeing on a real folder with many small groups: a row of
  outer blocks is as tall as its tallest block.
- **Crossings at borders** until stage 4, and possibly after it: the two-pass order is an approximation
  of ELK's hierarchical sweep. If it is not good enough, ELK's `LayerSweepCrossingMinimizer` is the
  reference to read next.
- **Speed.** Today: up to two dagre runs. After: per group 2–4 runs (rows, stand-ins, maybe sibling
  order, maybe stand-in order) plus 1–2 outer. Each is on a smaller graph, so total time may not rise
  much; measure with a few hundred notes in a handful of groups before stage 6.
- **Groups are never nested** (`groupOf()` in `flowchart-graph.js`: "groups never nest"), so only one
  level of the hierarchy exists. Most of ELK's hierarchy machinery — propagating ports through several
  levels — is not needed.
- **Settling after a write** (`flowchart-settle.js`) glides notes from old to new positions and keeps
  the note nearest the middle still. A write that moves a note into or out of a group now moves it
  between graphs; the glide still works (it compares positions by key), but the jump may be larger.
  Try by hand at stage 3.
- **The "one run" rule in CLAUDE.md** must be rewritten in the same commit that makes this the path for
  groups (stage 3), not left to stage 6, or the docs say the opposite of the code.

---

## 8. Things already worked out (do not rediscover)

- The width is dagre's compound mode, not anything gypsum does: the same chart is narrow and symmetric
  in plain dagre (±74) and in ELK (±82), and wide only with compound on, any group at all (§1).
- ELK's node placement is the same Brandes–Köpf as dagre's, `BALANCED` ≈ dagre's default (average of
  the middle two of four). The difference is entirely hierarchy handling.
- Mermaid moves no box after ELK. Its post-processing only straightens line ends
  (`straightenEdgeTerminals`: a terminal jog dropped when that adds no crossing), places labels, adds
  hops and evens out group frames.
- dagre 3.1.1's `constraints` option is broken for three or more nodes (it drops a constraint once the
  nodes it names have been merged); use `customOrder`, as `sibling-order.js` does
  (`plans/completed/flowchart-vertical-alignment.md`, *As built*). This applies to 3.7.
- When reordering nodes inside `customOrder`, move each one's **placeholder nodes** (dagre's dummies,
  marked with `edgeObj` and `rank`) with it, or the result crosses (5 crossings against 0, measured).
- dagre honours an edge's `minlen`, which is how a stand-in is pinned to a row (3.4).
- ELK puts a cut link's centre label on its outermost piece (3.2).
- **Groups are never link ends in gypsum** — a link always runs note to note; a subgraph is only a
  property of a note. So no route ever *ends* on a group's frame (mermaid allows that, and its adapter
  carries a comment about such edges leaving from a frame's corner), and every stand-in is a
  pass-through to a real note. Together with "groups never nest" this means only a thin slice of ELK's
  hierarchy handling is needed. **It does not remove the split itself**: a note in one group linking
  to a note outside it, or in another group (the reference chart's 009 → 012), still crosses a border,
  and everything in 3.2–3.8 is for exactly those links. Only if links could never cross a border would
  each group be a separate piece of the chart, laid out alone and packed — roughly 100–150 lines
  rather than 300–400 — and that is not gypsum's model.
