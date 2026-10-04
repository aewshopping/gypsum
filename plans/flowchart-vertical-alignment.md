# Plan: flowchart — alignment and balance

Status: **recommendation made (§7), not started.** Follows `plans/completed/flowchart-dagre-elk-layout.md`; every rule
in its *Who has the last word* still holds unless an option below says otherwise.

The look to aim for is `plans/reference/flowchart-layout-mockup-2-vertical-alignment.png`, which is
mermaid.live's drawing with its elk renderer. This plan sets out what that picture does that gypsum's
chart does not, **how mermaid gets there** (§3, from its own source), and the options for closing the
gap — each with what it costs in new code and in how much harder the layout becomes to follow.

Two principles, and the reference keeps both:

- **Alignment** — a note that carries straight on sits straight below the note before it, so the line
  between them is one vertical stroke. 008 → 010 and 007 → 011 are columns; so is 009 → 012, across a
  subgraph's border.
- **Balance** — a note that branches sits centred over what it branches to, and a note that gathers
  sits centred under what it gathers. 006 is centred over 008 and 007; 009 is centred under 010 and
  011; 003 is centred over 004, 006 and 005.

Where they meet they agree: 003 → 006 → 009 → 012 is a spine down the middle of the chart, because the
middle branch of a balanced fork is also an aligned column.

---

## 1. What gypsum draws today

The reference chart was rebuilt as notes (001–011 in subgraph `part1`, 012 in `part2`, links and their
text as in the picture) and drawn by the current code, separate arrows, top to bottom. Measured off the
screenshot (box centres, in screen px):

| What | Reference | Gypsum today |
|------|-----------|--------------|
| 007 → 011, a chain | one column | 643 → 627: a jog of 16 |
| 008 → 010, a chain | one column | 803 → 786: a jog of 17 |
| 009 → 012, a chain across groups | one column | 723 → 769: a jog of 46 |
| 006 over its two branches | centred | 748 over 643 and 803 (middle 723): 25 off |
| 003 over its three branches | centred, 006 in the middle | 546 over 390, 588, 748; 006 is on the **right** |
| 003 → 006 → 009 | one spine | three different columns |

With merged arrows the boxes are in the same places, joined by trunks.

Every box is 152 wide (`WIDE = 128` in `node-shape.js` plus padding) and most titles fit on one line;
in the reference the boxes are narrow and nearly every title takes two.

## 2. Why — four causes, found by experiment

Each was checked by changing one thing and drawing the chart again.

### 2.1 `close-row-gaps.js` bends chains (the main cause)

Every box and lane is pulled to the **mean** of what it links to, above and below, forty times over. It
is a row of springs, and springs sag: 011 is pulled half towards 007 and half towards its lane to 009,
and that lane is pulled towards 009, which sits between 010 and 011. So each chain leans in towards
the note it joins, a little more at each step down. 012 is pulled towards 009, but its group's
bounds stop it getting there.

**Evidence:** with `closeRowGaps` switched off, 007 → 011, 008 → 010 and 009 → 012 come out as
perfect columns: dagre's own positioning (Brandes–Köpf) already aligns them. But the chart is then
about 14% wider (the subgraph 697 wide against 612), with `001 → 003` run out to the group's far edge,
which is the problem this step was added to fix. It has to be made to keep dagre's alignment, not removed.

### 2.2 The continuing branch is put at the end

003's branches go to dagre sorted by key, 004, 005, 006, and nothing in dagre's crossing reduction
prefers another order, since neither order has any crossings. So 006, the branch the story carries on
down, is last; 003 sits over the middle of the three, and nothing below 006 can line up with 003. The
reference has 005, 006, 004 — and §3 shows where that order comes from.

### 2.3 Balance is dagre's to give, and only when nothing undoes it

dagre's positioning with no `align` option takes, for each box, the middle two of four candidate
positions and averages them. On this chart, given the order of §2.2's fix, that already centres every
fork and join exactly (§3.3). What spoils it is §2.1: `close-row-gaps.js` re-centres on the **mean**
of every neighbour above and below together, which is centring only when they happen to be evenly
spread.

**Evidence:** `align: 'UL'` (one candidate, upper-left) keeps every chain straight even through
`closeRowGaps`, because everything it pulls towards is already in one column. But it gives up balance
entirely: 003 and 006 sit over their left-hand branch, 012 jogs, and the chart leans left.

### 2.4 Wide boxes leave less room to line anything up

At 152 wide, one-line boxes plus labels up to 140 wide make each row exactly as wide as its boxes and
labels need, so `close-row-gaps.js` has little slack to move things into line. This is the smallest
of the four. **Evidence:** `WIDE = 90` makes the chart about 15% narrower and the boxes look
like the reference's, but the chain jogs are still there, and some titles go to three lines
("001 The / best / birthday"), so rows of mixed height appear.

---

## 3. How mermaid.live does it — read from its source, then run

mermaid.live renders with mermaid's own library, and its elk renderer is the `@mermaid-js/layout-elk`
package (1.0.1, the latest), which hands the chart to `elkjs` (^0.9.3) — ELK's *layered* algorithm, which uses Brandes–Köpf
positioning just as dagre does. The package ships its source unminified, so the settings below are
read straight out of it (`dist/chunks/mermaid-layout-elk.core/elk-*.mjs`). Then the reference chart
was handed to elkjs 0.9.3 in node with those exact settings, and again with one setting changed at a
time.

### 3.1 What mermaid sets, and what it leaves alone

- **No box is moved after ELK.** Mermaid's post-processing straightens the ends of lines
  (`straightenEdgeTerminals`: a route's first and last jogs removed when that adds no crossing — our
  `straighten.js`, with crossings as the test where ours uses clearance), places labels, adds line hops
  and evens out group frames. Nothing in it slides a box sideways. Whatever alignment and balance the
  reference has, ELK produced it, and nothing afterwards undid it.
- **The `default` preset**: Brandes–Köpf placement with `fixedAlignment: BALANCED`, network-simplex
  layering, depth-first cycle breaking. Its comment: *"Balanced Brandes-Koepf centers simple branches"*.
  The `legacy` preset (`fixedAlignment: NONE`) is what mermaid used before.
- **`considerModelOrder: NODES_AND_EDGES`**: where crossing reduction has no preference, ELK keeps
  things in the order the mermaid source declares them.
- One compound graph with subgraphs as parents (`hierarchyHandling: INCLUDE_CHILDREN`), the same choice
  `dagre-place.js` makes. Spacing: base 40 at the root, 24 inside groups, node-to-node 50, a port kept
  12 from a corner.
- The tuning was measured, not chosen by eye. The option catalogue in the source is a long commented
  list of every ELK knob, each with what it did "on this corpus" — e.g. `LINEAR_SEGMENTS: keeps chains
  aligned` and `NETWORK_SIMPLEX: balanced`, both tried and not chosen — and comments refer to
  automatic checks such as `edge-parallel-segment-too-close` run over a set of test charts. That is the
  same approach as `checkLayout` in our level 2 tests, taken further.

### 3.2 What changing one setting at a time showed

Box centres from elkjs on the reference chart, 100 × 50 boxes, labels sized from their text:

| Setting | chains | 006 over 007/008 | 009 under 010/011 | 003 → 006 → 009 → 012 |
|---|---|---|---|---|
| mermaid's default | straight | centred | centred | **straight** |
| `fixedAlignment: NONE` (legacy) | straight | 62 off | 62 off | 003 → 006 off by 248 |
| `fixedAlignment: LEFTUP` | straight | 62 off | 62 off | straight; 003 off-centre by 71 |
| network-simplex placement | straight | 62 off | 62 off | straight |
| 003's links declared 004, 005, 006 | straight | centred | centred | **003 → 006 off by 193** |

Three things follow:

1. **The middle 006 is not cleverness — it is the order the note was written in.** 003's note
   mentions *open chest panel* (005), then *press silver button* (006), then *screwdriver in belly
   button* (004). Declared in key order instead, ELK puts 006 last, exactly as gypsum does, and the
   spine breaks. Mermaid draws siblings left to right in the order the author wrote them.
2. **Balance is `BALANCED`.** Every other alignment setting keeps the chains and loses the centring.
3. **Chains come free from Brandes–Köpf** under every setting. Gypsum loses them afterwards
   (§2.1), not in dagre.

### 3.3 dagre can already draw the reference

The same chart, same sizes, through gypsum's copy of dagre in node:

| | width | 003, 006, 009, 012 | 007 / 011 | 008 / 010 |
|---|---|---|---|---|
| ELK, mermaid's settings | 755 | 342 (one column) | 412 | 272 |
| dagre, as gypsum calls it | 794 | 392, 669, 669, 669 | 594 | 744 |
| dagre + the note's order as `constraints` | 735 | **401 (one column)** | 326 | 476 |

With 003's branches constrained to the note's order, dagre's raw output has the same shape as ELK's:
both chains straight, 006 and 009 each exactly centred (401 between 326 and 476), and the spine
straight. It is also **no wider than ELK's**, so the reference chart is simply this wide: mermaid
does not narrow it and does not need to.

**So there is no need to port anything from ELK.** dagre gives the reference picture once it is told
the note's order, and as long as gypsum's own step after it keeps the columns dagre drew.

---

## 4. The options

Costs are in new or changed lines of code (tests separately) and in **complexity**: how much more a
reader has to hold in their head to follow the layout afterwards. For scale, the layout is 1,419 lines
over 16 modules; `close-row-gaps.js` is 197.

### Option A — wrap titles sooner

`WIDE` from 128 to about **100–104**, which in the app's font gives two lines to most titles of the
reference's length without sending "001 The best birthday" to three. Optionally `LABEL_WIDTH` from 140
to about 120, so link text, which in this chart is wider than the boxes, wraps a little sooner too.

- **Code:** 1–2 constants. **Complexity:** none.
- **What it buys:** a narrower, taller chart like the reference's; more slack per row for the other
  options to use. **Does not** align or balance anything on its own.
- **Risk:** three-line titles where a title is long; the right width is a matter of trying a few real
  folders by eye. No test asserts the width.

### Option B — dagre's `align` option (not recommended)

One of `UL`, `UR`, `DL`, `DR`. **Code:** 1 line. Gives alignment and loses balance; §3.2 shows ELK
behaves the same way, and that mermaid moved off it (`legacy`) towards `BALANCED`. dagre's default is
already the balanced one.

### Option C — siblings in the order the note gives them (the mermaid rule)

**Revised after §3.** The first draft had dagre put "the branch that carries on furthest" in the
middle. Mermaid's rule is simpler and gives the author control: **a note's links are laid out left to
right in the order the note mentions them.** For each note, take its links in note order (which
`flowchart-graph.js` already produces, file by file), keep those whose targets land in one row of
dagre's ranking and share a group, and give dagre `constraints: [{left, right}, …]` between
neighbours. dagre honours them inside its own crossing reduction, so **the order stays dagre's
decision**; the rule in *Who has the last word* that reserves reordering a row for dagre is kept.

- **Stable for the same reason key order was:** the order is inside one note, so re-sorting the
  table, or editing *another* note, changes nothing. Rewriting the note's own links reorders its
  branches, which is the point, and the author can see the cause. The "order notes and links arrive in
  changes nothing" test still holds for the order the *files* arrive in, and must say so.
- **Today's order is less meaningful than it looks.** Boxes are sorted by key, and a key is
  `note:<internalId>`, not the filename, so the current left-to-right order is load order rather than
  anything a reader can see.
- **Code:** ~30–40 lines: `layout/sibling-order.js` (pure: links in, constraint pairs out), one
  argument to `dagre.layout` in `dagre-place.js`, and `byText(a.from, b.from) || a.i - b.i` in place of
  sorting by target key. **Complexity:** low. One rule, stated in one module, and the same rule as
  mermaid's.
- **Risks to settle with node tests before relying on it:**
  - gypsum has never used dagre's `constraints`, and the test in §3.3 had no subgraphs. Only siblings
    under one parent can be constrained, so it should be limited to targets that share a group.
  - Two notes may ask for opposite orders of the same pair. A pair that is already constrained, or
    would close a cycle, is skipped, and the first note in key order wins.
  - A constraint can force a crossing dagre would have avoided. ELK takes the same risk
    (`considerModelOrder` is only a tie-break there, while a dagre constraint is binding), so the
    safer form is to constrain only the branches of a note that are reached from nowhere else in their
    row. Try it on real folders both ways.

### Option D — keep the columns dagre drew (`close-row-gaps.js`) — superseded by §7 step 1

**Revised after §3.** The first draft found chains by counting links (one down, one up). Mermaid's
lesson is that Brandes–Köpf has already decided what lines up with what, and the mistake is undoing it
afterwards. So: **any link whose two boxes and every lane between them dagre put in one column is
held straight** — those boxes and lanes become one item, joined up (union–find) where a box is in
more than one such link. This generalises what the step already does for "a link's lanes that ran in
one straight column", from lanes to boxes. On the reference chart it makes three items: 003–006–009–012
with its lanes, 007–011 and 008–010. The forks stay centred because dagre centred them, and the step's
pulls on the two branches are symmetrical, so they move in or out together and keep their middle.

The step keeps doing what it was added for: it still narrows loose rows, and it still never changes an
order, never comes nearer than dagre's spacing, and never crosses a group's edge.

- **Code:** ~40–60 lines, almost all in `rowItems()` of `close-row-gaps.js`: the straight-link test it
  already has, applied to links whose ends are boxes, and a union–find to merge items. `room()`, the
  sweep and the group bounds are untouched. No new module needed.
- **Complexity:** moderate-to-low. The step does nothing new: it changes what counts as one item, and
  the rule is short: what dagre drew straight stays straight.
- **Optional extra, ~10 lines:** an item's wanted position as the middle of the **span** of what it
  links to on its busier side, rather than the mean of all neighbours. That is balance by centring,
  for the charts where dagre's balance was not exact. Try without it first; §3.3 suggests it is rarely needed.
- **Risk:** a column has less room than its parts, so a crowded row may stay a little wider than today.
  It is never wider than dagre drew it, which §3.3 shows is about ELK's width.

### Option E — a priority alignment pass of its own (not recommended)

A new step after `closeRowGaps` (the textbook *priority layout* method): links ranked and straightened
in turn. **~150–200 lines, high complexity**, a second sideways mover beside the first. §3 shows neither
mermaid nor ELK needs one: Brandes–Köpf already does this job.

### Option F — a different placement algorithm (not recommended)

ELK's own catalogue tried network-simplex and linear-segments placement for mermaid and kept
Brandes–Köpf, and §3.2 shows network simplex loses the centring on this chart. Porting either,
or ELK itself, is **400+ lines** of hard algorithm. Listed so it is not rediscovered.

### Small, related: tops of a row in line

Boxes of different heights are centred on their row, so with option A some rows will hold two- and
three-line boxes whose tops do not line up, and the arrowheads then end at different heights.
dagre 3.1.1 has `rankalign: 'top'`; the catch is that `ranks.js` finds a box's row from its centre
(`rankY`), which would have to come from the row instead. **~10–20 lines, low complexity.** Only worth
it if A's three-line titles turn out to be common.

---

## 5. Is the process wrong, or one step in it?

**One step.** Gypsum's process is mermaid's: a layered layout decides rows and order, Brandes–Köpf
decides where along a row, link labels are placeholder nodes in the graph, and a pass afterwards draws
the routes. The reference picture depends only on where the boxes are, and §3.3 shows dagre already
puts them there. There is one difference, and it is the cause: **mermaid never moves a box after ELK
has placed it, and gypsum's `close-row-gaps.js` does.** The way forward is to narrow what that step may
do, and to tell dagre the order the note gives. Nothing gets replaced.

## 6. Tried in the app

To weigh the options, each was prototyped in place (none committed), and the reference chart and the
existing one-subgraph chart (`ONE_GROUP` in `62-flowchart-layout-look.spec.js`) were drawn and
measured. The figure is the width of the main subgraph.

| Variant | Reference chart | One subgraph | What the reference chart looks like |
|---|---|---|---|
| Today | 777 | 730 | chains jog, nothing centred, spine broken |
| `closeRowGaps` off | 842 | 741 | chains straight, 006 and 009 centred, 009 → 012 straight; 006 still at the end |
| **Boxes stay put, lanes still move** | 842 | 741 | the same as off |
| Boxes stay put + note order for every note | 754 | 754 | spine straight, but **008 → 010 and 007 → 011 cross** |
| **Boxes stay put + note order for 3+ branches** | **754** | 754 | **the reference**: spine straight, both chains straight, 006 and 009 centred, no crossing; only 007 and 008 swapped |

The last row passes all 38 existing tests in `62-flowchart-layout.spec.js` unchanged.

Three findings settle the choice:

1. **Option D is not needed.** With the boxes left where dagre put them, the lanes alone recover
   nearly all the width `close-row-gaps.js` was saving: 1.5% wider on the one-subgraph chart. On the
   reference chart, adding the note order makes it **narrower than today** (754 against 777), because
   a balanced chart is a compact one. Keeping the step's power to move boxes, and teaching it which
   boxes not to move (D, ~40–60 lines), buys almost nothing over not moving boxes at all.
2. **dagre's `constraints` are binding, where ELK's model order is only a tie-break,** and that
   matters. Constraining 006's two branches to the note's order (008 before 007) made dagre cross the
   two chains below them rather than reorder that row. Constraining only notes with **three or more**
   branches, where order decides which one is in the middle, avoided it. A note with two branches
   needs no order for balance: it is centred over both either way.
3. Labels, routes, ports and tracks needed no change for any of this.

## 7. Recommendation

**Two steps, about 45–60 lines of new code in all, and a slightly smaller `close-row-gaps.js`.**

### Step 1 — boxes stay where dagre put them

In `close-row-gaps.js`, boxes stop moving: they stay in the rows as fixed things the lanes cannot pass,
and as what the lanes are pulled towards, but no longer get a wanted position of their own. Lanes
still close up as before.

- **Code: net about −10 lines.** The `neighbours` block in `rowItems()` and the box's `apply()` go;
  `wanted` is `null` for a box. The module header, and CLAUDE.md's *"Rows are drawn together after
  dagre … Each box and lane slides towards what it links to"*, are rewritten to say boxes keep dagre's
  place, which is mermaid's rule.
- **Complexity: lower than today.** One fewer thing moves after dagre.
- **Benefit on its own:** both chains and 009 → 012 straight, 006 and 009 centred. Cost: 8% wider
  on the reference chart until step 2, 1.5% on the one-subgraph chart.

### Step 2 — a note's branches in the order the note gives them, when there are three or more

Option C, scoped by the finding above. For each note with three or more links into one row of one
group, pass dagre `constraints` placing them left to right in the order the note mentions them.

- **Code: ~25–35 lines** — `layout/sibling-order.js` (pure: links in note order, and dagre's turned
  links, in; constraint pairs out) and one argument to `dagre.layout` in `dagre-place.js`.
- **Plus a guard, ~15–20 lines, recommended:** count crossings between rows in dagre's result, and if
  the constrained run has more than an unconstrained one, use the unconstrained one. This is mermaid's
  own rule for its line straightening (`straightenEdgeTerminals` keeps a change only if it adds no
  crossing). It costs a second dagre run, only on charts where some note has three or more branches.
  Without it, step 2 is safe on every chart tried, but the 006 case shows how a constraint can cross
  lines elsewhere.
- **Complexity: low.** One rule, the author's order, in one module.
- **Benefit:** the spine, and the narrowest chart of every variant tried.
- **What users see change:** a note with three or more links draws them left to right in the order
  it mentions them. Today the order comes from internal ids, which nobody can see, so this replaces
  an order nobody chose with one the author chose.

### Not now

- **A (wrap titles sooner)** changes the look rather than the alignment. Worth a separate try by eye,
  one constant, once steps 1 and 2 are in.
- **D (keep dagre's columns)** is superseded by step 1. Revisit only if a real folder shows a row
  left loose that lanes alone do not close.
- **B, E, F** stay rejected; **tops in line** only if A brings three-line titles.

| Step | New code | Removed | Complexity | Gives |
|---|---|---|---|---|
| 1 — boxes stay put | ~0 | ~10 | lower | alignment, balance from dagre |
| 2 — note order, 3+ branches | ~25–35 | — | low | the spine, a narrower chart |
| 2's guard | ~15–20 | — | low | no new crossings, ever |
| tests | ~50–70 | — | — | the rules held |

Try each step by hand against the reference before the next, as the layout plan was.

## 8. Testing

- **Level 2**, in `tests/2-behaviour/62-flowchart-layout.spec.js`: node tests, milliseconds. The
  reference chart becomes a fixture beside `MOCKUP`, its links in the reference's order, run through
  the existing `checkLayout` and `checkRoutes` in every variant (top to bottom, left to right,
  merged). New assertions, each a rule a later change could silently break:
  - 003, 006, 009 and 012 share one column, and so do 007/011 and 008/010 (step 1);
  - 006 and 009 are centred on their branches to within a pixel (step 1);
  - a note with three branches has them left to right in the order it gives them (step 2), and the
    order the *files* arrive in still changes nothing;
  - the guard: a fixture where the constraint would cross lines, as 006's did, draws without the
    crossing. The 006 case itself can be that fixture, with the scope lowered to two in the test.

  About 50–70 lines. A node test of dagre's `constraints` inside a compound graph comes first.
- **Level 3**: the reference chart added to `62-flowchart-layout-look.spec.js` as one more screenshot,
  to compare with the reference picture by eye. ~15 lines.
- **Level 1**: nothing — nothing here writes a note.

## 9. Where the code goes

| Step | Files |
|---|---|
| 1 | `services/flowchart/layout/close-row-gaps.js` |
| 2 | new `services/flowchart/layout/sibling-order.js`; `dagre-place.js` |
| later: A | `ui/ui-functions-flowchart/node-shape.js` (`WIDE`), maybe `render-svg.js` (`LABEL_WIDTH`) |

Each step bumps the manifest's minor version. CLAUDE.md's *The flowchart's layout* is updated for
each: boxes keep the place dagre gives them (the close-row-gaps line rewritten), and a note's three or
more branches are drawn in its own order. *"The picture does not follow the sort"* stays true, and
should say that this order follows each note's own text and nothing else.
