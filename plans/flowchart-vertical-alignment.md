# Plan: flowchart — alignment and balance

Status: **options, not started.** Follows `plans/completed/flowchart-dagre-elk-layout.md`; every rule
in its *Who has the last word* still holds unless an option below says otherwise.

The look to aim for is `plans/reference/flowchart-layout-mockup-2-vertical-alignment.png`. This plan
sets out what it does that gypsum's chart does not, why, and the options for closing the gap — each
with what it costs in new code and in how much harder the layout becomes to follow.

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

Merged arrows draws the same positions, with trunks.

Every box is 152 wide (`WIDE = 128` in `node-shape.js` plus padding) and most titles fit on one line;
in the reference the boxes are narrow and nearly every title takes two.

## 2. Why — four causes, found by experiment

Each was checked by changing one thing and drawing the chart again.

### 2.1 `close-row-gaps.js` bends chains (the main cause)

Every box and lane is pulled to the **mean** of what it links to, above and below, forty times over. It
is a row of springs, and springs sag: 011 is pulled half towards 007 and half towards its lane to 009,
and that lane is pulled towards 009, which sits between 010 and 011. So each chain leans in towards
the note it joins, by a little more at each step down. 012 is pulled towards 009, but its group's
bounds stop it getting there.

**Evidence:** with `closeRowGaps` switched off, 007 → 011, 008 → 010 and 009 → 012 come out as
perfect columns — dagre's own positioning (Brandes–Köpf) already aligns them. But the chart is then
half as wide again, `001 → 003` running out to the group's far edge, which is what the step was
added to fix. It has to be made chain-aware, not removed.

### 2.2 dagre's order puts the continuing branch at the end

003's branches arrive sorted by key, 004, 005, 006, and nothing in dagre's crossing reduction prefers
another order — there are no crossings either way. So 006, the branch the story carries on down, is
last, 003 sits over the middle of the three, and nothing below 006 can line up with 003. The reference
has 004, 006, 005.

**Evidence:** handing dagre (3.1.1) `constraints: [{left: 004, right: 006}, {left: 006, right: 005}]`
in a node test of the same graph puts 003, 006 and 009 all at x = 335 — the spine — and leaves the
chains straight.

### 2.3 dagre balances by averaging, not by centring

With no `align` option dagre works out four alignments and takes the average of the middle two. That
is a statistical balance, not "centred over my branches": in the default run above, 003 is at 285 over
branches at 135, 335 and 535. Usually close, rarely exact — and `close-row-gaps.js` then pulls by the
mean of the branches, which is centring only when the branches are evenly spaced.

**Evidence:** `align: 'UL'` (one alignment, upper-left) keeps every chain straight even through
`closeRowGaps`, because everything it pulls towards is already in one column — but it gives up balance
entirely: 003 and 006 sit over their left-hand branch, 012 jogs, and the chart leans left.

### 2.4 Wide boxes leave less room to line anything up

At 152 wide, one-line boxes plus labels up to 140 wide make each row as wide as its labels and boxes
allow and no wider, so `close-row-gaps.js` has little slack to move things into line. This is the
smallest of the four. **Evidence:** `WIDE = 90` makes the chart about 15% narrower and the boxes look
like the reference's — but the chain jogs are still there, and some titles go to three lines
("001 The / best / birthday"), so rows of mixed height appear.

---

## 3. The options

Costs are in new or changed lines of code (tests separately) and in **complexity**: how much more a
reader has to hold in their head to follow the layout afterwards. For scale, the layout is 1,419 lines
over 16 modules; `close-row-gaps.js` is 197.

### Option A — wrap titles sooner

`WIDE` from 128 to about **100–104**, which in the app's font gives two lines to most titles of the
reference's length without sending "001 The best birthday" to three. Optionally `LABEL_WIDTH` from 140
to about 120, so link text — which in this chart is wider than the boxes — wraps a little sooner too.

- **Code:** 1–2 constants. **Complexity:** none.
- **What it buys:** a narrower, taller chart like the reference's; more slack per row for the other
  options to use. **Does not** align or balance anything on its own.
- **Risk:** three-line titles where a title is long; the right width is a matter of trying a few real
  folders by eye. No test asserts the width.

### Option B — dagre's `align` option

One of `UL`, `UR`, `DL`, `DR` in `graph.setGraph(...)`.

- **Code:** 1 line. **Complexity:** none to read, but it changes every chart's character.
- **What it buys:** alignment, for free.
- **What it costs:** balance — forks hang off their left (or right) branch and the whole chart leans.
  **Not recommended**, unless option C turns out to rebalance an aligned start better than a balanced
  one; that is a ten-minute experiment once C exists.

### Option C — make `close-row-gaps.js` chain-aware (alignment, and balance by centring)

Two changes to the one step that is causing the jogs, keeping everything that step already promises
(order kept, dagre's spacing kept, nothing crosses a group's edge):

1. **A chain moves as one.** Where a note has exactly one link down and the note it reaches has exactly
   one link up, the two boxes and every lane between them become one item — the same thing the step
   already does for "a link's lanes that ran in one straight column". Chains of chains join up
   (union–find over those links), so 006's branch 008 → 010 is one item and 009 → 012 another. A chain
   whose boxes or lanes dagre did not put in one column is joined only if it can be put in one without
   pushing anything — otherwise it stays loose, as today.
2. **A fork or a join is centred, not averaged.** An item's wanted position becomes the **middle of the
   span** of what it links to on its busier side — over its branches if it branches, under what it
   gathers if it gathers — rather than the mean of every neighbour above and below together. A chain's
   wanted position is the same question asked of its two ends.

What the reference shows then falls out: 007/011 and 008/010 are columns; 009 is centred under them, and
012 hangs straight off 009 because 009 → 012 is one item; 006 is centred over 008 and 007.

- **Code:** ~60–80 lines. Chain-finding as a module of its own (`layout/chains.js`, ~40 lines, pure),
  and ~25–40 changed in `close-row-gaps.js` — `rowItems()` builds one item per chain rather than one
  per box, and `wanted` becomes span-centring. The sweep, `room()` and the group bounds are untouched.
- **Complexity:** moderate. One new idea (a chain), and it is the generalisation of one the module
  already has (lanes that move as one). Nothing new to learn anywhere else.
- **Risk:** a rigid chain has less room than its parts, so a crowded row may hold a chain further from
  centre than today's loose boxes got — never wider, since nothing may move past a neighbour. Merged
  arrows and left to right get it for nothing (merging changes ports, not positions; left to right is
  the same chart turned).
- **Does not** fix 2.2: with 006 at the end, 003 is centred over its three branches but 006 is not
  under 003.

### Option D — ask dagre for the continuing branch in the middle (balance of order)

Before `dagre.layout`, for each note with **three or more** branches in the row below, choose the
branch that carries on furthest — the longest run of notes beneath it, ties to key order — and give
dagre `constraints` placing it in the middle, the rest alternating either side in key order. Two
branches have no middle and are left to dagre; their balance is option C's centring.

dagre honours the constraints inside its own crossing reduction, so **the order is still dagre's
decision**: *Who has the last word* reserves reordering a row for dagre, and this asks dagre rather
than overriding it.

- **Code:** ~40–50 lines — `layout/branch-order.js` (pure: the graph in, the constraint pairs out) and
  one argument in `dagre-place.js`.
- **Complexity:** low-to-moderate: one new rule ("the one that carries on goes in the middle"), stated
  in one module. dagre's `constraints` is an option nothing in gypsum uses yet, so its behaviour in a
  compound graph (only siblings under one parent are compared) needs a node test before trusting it.
- **Risk:** a constraint can force a crossing dagre would have avoided. Only constrain branches that
  have no other link up into their row; a fork whose branches are also reached from elsewhere is left
  alone. The existing "order notes and links arrive in changes nothing" test must still pass, which it
  will as long as every choice ends in key order.
- **What it buys with C:** the spine, 003 → 006 → 009 → 012. **Without C** the spine appears in dagre's
  output and `close-row-gaps.js` then bends it, as it does the chains today.

### Option E — a priority alignment pass of its own (not recommended)

A new step after `closeRowGaps`: the textbook *priority layout* method — links ranked (chains first,
then the middle branch of a fork, then the rest), each in turn straightened by sliding its ends within
the room the row allows, the higher priority winning.

- **Code:** ~150–200 lines, a new module, and `straighten.js` (71 lines) partly folded into it.
- **Complexity:** high. A second step that moves boxes sideways, with its own idea of who wins, beside
  the one that already does; the two have to be kept from undoing each other.
- **Why not:** C gets the same picture on this chart by changing what an item is in the step that
  already moves things, rather than adding a rival to it. Worth reconsidering only if C, tried on real
  folders, leaves charts that a ranked pass would plainly fix.

### Option F — replace dagre's x positioning (not recommended)

Graphviz's `dot` assigns x by network simplex, which straightens long links and centres forks in one
optimisation; dagre (Brandes–Köpf) does not. Writing that, or replacing dagre's positioning with
`customOrder`-style hooks, is **400+ lines** of hard algorithm, and it is writing the layout rather than
refining it — exactly what the layout plan ruled out. Listed so it is not rediscovered.

### Small, related: tops of a row in line

Boxes of different heights are centred on their row, so with option A some rows will hold two- and
three-line boxes whose tops and bottoms do not line up — the arrowheads then end at different heights.
dagre 3.1.1 has `rankalign: 'top'`; the catch is that `ranks.js` finds a box's row from its centre
(`rankY`), which would have to come from the row instead. **~10–20 lines, low complexity.** Only worth
it if A's three-line titles turn out to be common.

---

## 4. Recommendation

**A, then C, then D**, each tried by hand against the reference before the next, as the layout plan
worked.

| | Code | Complexity | Alignment | Balance |
|---|---|---|---|---|
| A — wrap sooner | 1–2 constants | none | indirect | indirect |
| B — dagre `align` | 1 line | none | yes | **lost** |
| C — chain-aware close-row-gaps | ~60–80 | moderate | **yes** | forks and joins centred |
| D — continuing branch in the middle | ~40–50 | low–moderate | the spine | order |
| E — priority pass | ~150–200 | high | yes | partly |
| F — own x positioning | 400+ | very high | yes | yes |
| tops in line | ~10–20 | low | rows | — |

A + C + D is about **100–130 lines** of new code, two new pure modules and one rewritten function, and
on the reference chart should draw every relationship the reference shows: both chains, the spine, and
003, 006 and 009 centred.

## 5. Testing

- **Level 2**, in `tests/2-behaviour/62-flowchart-layout.spec.js` — node tests, milliseconds. The
  reference chart becomes a fixture beside `MOCKUP`, run through the existing `checkLayout` and
  `checkRoutes` in every variant (top to bottom, left to right, merged). Three new assertions, each a
  rule a later change could silently break:
  - a link from a note with one link down to a note with one link up is **one straight segment**;
  - a fork with three branches has its **middle branch centred under it** (D);
  - a fork or join is **centred on the span** of its branches, to within a pixel, where its row
    allows (C).

  About 40–60 lines.
- **Level 3**: the reference chart added to `62-flowchart-layout-look.spec.js` as one more screenshot,
  to compare with the reference picture by eye. ~15 lines.
- **Level 1**: nothing — no option here writes a note.

## 6. Where the code goes

| Option | Files |
|---|---|
| A | `ui/ui-functions-flowchart/node-shape.js` (`WIDE`), maybe `render-svg.js` (`LABEL_WIDTH`) |
| C | new `services/flowchart/layout/chains.js`; `close-row-gaps.js` |
| D | new `services/flowchart/layout/branch-order.js`; `dagre-place.js` |
| tops in line | `dagre-place.js`, `ranks.js` |

Each step that changes code bumps the manifest's minor version, and CLAUDE.md's *The flowchart's
layout* gains a line for each rule that lands: chains move as one, forks are centred on their span, the
continuing branch goes in the middle.
