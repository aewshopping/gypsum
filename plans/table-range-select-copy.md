# Plan: range select and copy in table view

Status: **not started.** Its dependency, the undo stack, is built (see below).
Branch: `claude/table-range-select-copy-paste-iq6tcf`
Depends on: `plans/completed/table-undo-stack.md`, **built**
Related: `plans/table-range-paste.md`, which depends on this

---

## 1. What this delivers

Selecting a rectangular range of table cells, and copying its contents to the clipboard with
`Ctrl/Cmd+C`. Built in two steps, and the first stands on its own:

1. **Selecting a range** — §2 and §3. Nothing is written or copied; a range is drawn and kept.
2. **Copying it** — §4. Reads the range step 1 leaves in `appState`.

**In scope:**

- **Pointer:** press in a cell and drag to another cell.
- **Keyboard:** `Shift`+arrow extends the range one cell at a time, and `Ctrl/Cmd+Shift`+arrow
  extends it to the end of the row or column — the existing navigation (arrow, and `Ctrl`+arrow to
  the end of the line) with `Shift` held.
- Copy to the clipboard.

**Not designed for touch.** A finger drag on the table scrolls, as it does now, and nothing here
changes that. Anything a touch screen gets from the pointer code is a bonus, not a promise — the
pointer handlers ignore `pointerType === 'touch'`, so a finger never paints half a range before the
browser takes the gesture for a scroll and cancels it.

**Explicitly out of scope:** pasting (that is `plans/table-range-paste.md`), non-rectangular or
multiple selections, selecting whole rows or columns by their headers, dragging a fill handle, and
auto-scrolling the table while a drag is held at its edge (§3.6).

### 1.1 Why the undo stack comes first

Copy writes nothing, so it needs no undo of its own — but the selection model it introduces is what
paste then writes through, and a fifty-cell paste with no way back is not shippable. Building the
selection first and the safety net second means the dangerous half arrives before the net. The undo
plan also already assumes a pasted range in its write signature (`applyRawEdits` taking a list), so
its shape is the one to build against.

---

## 2. The range model

### 2.1 Focus stays on the cell the range started from

**Decided: the anchor is the focused cell, and the range grows away from it**, as in a spreadsheet.
The other corner, the *extent*, is the only new fact. So:

- **"Selection follows focus" is untouched.** The focused cell is the anchor and keeps its
  `is-selected` outline inside the range, marking where the range began and where a plain arrow
  will move from.
- **A mouse drag never moves focus at all.** The press focuses the start cell natively, as it does
  today; the drag moves only the extent. So nothing in `handleCellFocusIn` has to tell a range's own
  focus move from anyone else's — **any focus move ends the range** (§2.3), with no flag.
- **`Shift`+arrow moves the extent, not focus.** With no range, the extent starts at the focused
  cell. `Ctrl+Shift`+arrow jumps the extent to the end of its row or column, and `Shift+PageDown`
  by a page. `keyboard-navigate.js` already turns a key and an index into a target index; that
  arithmetic is lifted into one function asked from either index — focus's for a plain arrow, the
  extent's with `Shift` — so the edge rules exist once.
- **Without `Shift`, an arrow clears the range and moves from the anchor**, which is the focused
  cell, so that is exactly today's behaviour.
- **The extent has to be scrolled into view by hand**, since no focus move happens to do it.
  `table-focus-scroll.js` already knows how to bring a cell clear of the header and the sticky
  columns; its body becomes a function taking a cell, called by its `focusin` handler as now and by
  the range code for the extent.

### 2.2 Where it lives

`appState.tableRange`: `null`, or `{ anchor, extent }`, each `{ id, prop }` — a cell addressed by its
row's file id and its column, the way `keep-cell-state.js` already addresses one, never by
`data-index`, which shifts when the rows do. `anchor` is always the focused cell, but it is stored
rather than read off `document.activeElement` so copy (and later paste) read one place.

**Writing `appState` on every cell crossing is cheap; re-rendering is not, and nothing here
re-renders.** A drag writes `tableRange` and calls one paint function (§3.3) that moves two classes.
`renderFiles` calls the same paint function after it replaces the rows, so a range survives the
redraws that change nothing (a cell commit, an autosave).

**A range is cleared when the rows it spans may no longer be the rows on screen**: a render that
draws different ids or a different order (a sort, a filter, a page change — the same test
`view-transition.js` already asks of `pageFileIds`), a view change, and a folder load. A range is on
one page by construction: only cells on the page can be pressed or arrowed to.

**A range of one cell is no range.** When the anchor and extent are the same cell, `tableRange` is
set back to `null`, so "is there a range" is one test and a drag that comes back to where it started
leaves the table as a plain click would.

### 2.3 What ends a range

- **Any focus move** — a plain arrow, Tab, a press in a cell, a press outside the table.
  `handleCellFocusIn` clears `tableRange`, one line in the one door selection already goes through.
  Nothing the range does moves focus, so nothing needs exempting.
- A press on the anchor itself (which is already focused, so fires no `focusin`) starts a new drag
  from it, which replaces the range on its first crossing and clears it if released where it began.
- Escape, when no cell is open (an open cell's Escape still belongs to the cell, one level at a time).
- Opening a cell (Enter, F2, a second press): the open cell is the whole of the user's attention.

## 3. Selecting with the pointer

### 3.1 A click and a drag are told apart by the cell, not by pixels

**A drag is a press whose pointer reaches a different cell before it is released.** No distance
threshold: the grid is its own threshold, and a wobble inside one cell is still a click.

This needs very little of its own, because **the browser already makes a click only when the press
and the release land on the same element.** A press in cell A released in cell B fires its `click`
on their common ancestor, which carries no `data-action` — so `expand-cell` is never reached, and the
existing two-press cycle (first press focuses, second opens) is untouched. So the answer to "should
opening move to pointerup" is no: it already effectively is, and moving it would mean re-deriving
what `click` gives for nothing.

**The one case the browser does not cover** is a drag that leaves its cell and comes back: pressed in
A, dragged to B, released in A. That is a `click` on A, and if A was already focused it would open.
So a press that crossed a cell sets `dragged`, and `handleCellExpand` returns early when it is set —
next to `pressWasOnSelectedCell()`, which exists for the same reason (the press knows something the
click cannot find out). Cleared on the next `pointerdown`.

### 3.2 The handlers

In a new `ui-functions-cell/cell-range-drag.js`, registered in `event-listeners-add.js` beside
`handleCellPointerDown`:

- **`pointerdown`** — primary button, not touch, landing on a *closed* cell. A press inside an open
  cell belongs to the caret and its own text selection. With `Shift` held it would be a shift-click
  extending from focus; **not in this step**, but it falls out of the model for one line if wanted.
  Records the pressed cell as the drag's start. Focus arrives on it natively, as today.
- **`pointermove`** on the document — returns at once unless a drag is in progress, then finds the
  cell under the pointer (`evt.target.closest('.note-table-cell')`, ignoring anything outside
  `.list-table`) and **does nothing unless it is a different cell from last time.** So the work is
  per cell crossed — tens in a drag — not per mouse event. On the first crossing: the anchor is the
  start cell, the table gains `is-ranging` (§3.5), and `dragged` is set.
- **`pointerup` / `pointercancel`** on the document — end the drag. Nothing else: focus is already
  on the anchor, where it stays (§2.1), and the range is already painted.

**Focus never moves during a drag**, which is also what keeps the table still under the pointer:
focusing each crossed cell would run `table-focus-scroll.js` mid-drag and scroll a different cell
under it.

Document listeners rather than pointer capture: capture set on `pointerdown` retargets the `click`
to the capturing element, which would break the click that opens a cell. If a release outside the
window turns out to be missed, capture can be taken on the *first crossing*, when there is no click
left to protect.

### 3.3 Drawing the outline: one overlay, anchored to the range's corner cells

**The range is one element with a border, and it never follows the pointer.** Its four edges are
pinned by CSS anchor positioning — already used by the undo list, the tooltip and the completion
popup — to the outer edges of two *cells*:

```css
.note-table-cell.range-start { anchor-name: --range-start; }
.note-table-cell.range-end   { anchor-name: --range-end; }

.table-range {
    position: absolute;
    top:    anchor(--range-start top);
    left:   anchor(--range-start left);
    bottom: anchor(--range-end bottom);
    right:  anchor(--range-end right);
    border: 2px solid var(--colour-contr);
    background: color-mix(in srgb, var(--colour-contr) 8%, transparent);
    pointer-events: none;
}
.list-table:has(.range-start) .table-range { display: block; }   /* none otherwise */
```

**How it tracks a drag.** The pointer is only ever used to answer "which cell am I over?". Each time
that answer changes (§3.2), the paint function:

1. takes the anchor's row and column and the hovered cell's row and column (row = the row
   element's position in `.list-table`, column = the cell's position in its row);
2. works out the rectangle's **top-left** cell — lowest row, lowest column — and its
   **bottom-right** — highest of each. These are often *neither* the anchor nor the hovered cell:
   anchor r1 c3 dragged to r5 c1 gives r1 c1 and r5 c3;
3. moves `range-start` and `range-end` onto those two cells.

The browser re-resolves the overlay in the same frame, so its border sits on the outer edges of the
cells at the rectangle's corners and therefore along the cell boundaries all the way round. It jumps
a whole cell at a time as the pointer crosses into the next one; a free-form drag rectangle is never
drawn, because nothing is ever positioned from the pointer's coordinates. The keyboard reaches the
same paint function with the extent in place of the hovered cell.

What that buys:

- **Painting a range is moving two classes**, whatever its size. No class on each of hundreds of
  cells, no `getBoundingClientRect`, no JS per frame.
- **It stays right without being told.** A column resize, a sideways scroll, a row re-rendered in
  place: the browser re-resolves the anchors, and none of those code paths need know a range exists.
- **One border round the outside**, with no inner lines to suppress. Per-cell edge classes
  (`range-top`, `range-left`…) reach the same picture with four classes and a box-shadow per side on
  every cell the range touches.
- **The tint layers over the row colour** without knowing it. A row's background is
  `attr(data-color)` through `color-mix` with hover and suppressed branches (see the fade note in
  `note-table-cell.css`); a translucent layer on top sidesteps all of them — and, being a separate
  element, it does not eat the anchor's outline the way the mask did.

**Where the overlay lives:** one element inside `.list-table`, the sideways scroller, given
`position: relative` so it is the containing block, and **after the rows in tree order** — an anchor
sharing the positioned element's containing block must be laid out before it. Anchors in the same
scroll container move with it, so no scroll compensation is asked of the browser. Drawn by the table
renderer, so it exists while the table does.

**Stacking:** above the rows and the sticky cells (4), below `.table-chrome` (6), so it slides under
the header like the rows. An opened sticky cell is 5; the overlay can share 5 since a range ends when
a cell opens (§2.3). Update the stacking note in CLAUDE.md with it.

**Prototyped, and it works — the sticky case included** (standalone page with the table's
`subgrid` rows, `overflow: clip visible` and a sticky first column, driven by Playwright in
Chromium). A drag from r1 c3 to r5 c1 outlines exactly r1–r5 × c1–c3, updating as it goes. A range
from the sticky column to c4 with the table scrolled sideways draws its left edge at the sticky
column's *stuck* position, not its laid-out one, so the outline stays correct across the boundary.

### 3.4 Text selection

**Closed cells get `user-select: none`**, always, not only during a drag. Otherwise a drag across
cells paints the browser's own text selection over the range, and a second highlight saying
something different is worse than none. An open cell keeps its text selection, since that is the
caret's. Nothing is lost: selecting part of a closed cell's text was never a supported act — the
second press opens it.

**Links and images in a cell are not draggable.** An `<a href>` starts a native drag-and-drop when
pressed and moved, which cancels the pointer stream (`pointercancel`) and ends the range at once —
from any cell holding a `[[link]]`, the file column's link and a tag pill. `-webkit-user-drag: none`
on `.list-table a`, or `draggable="false"` in `render-internal-link.js` and the pill renderer; the
CSS is one line and needs no renderer to know.

### 3.5 `is-ranging`

A class on `.list-table` for the length of a drag, for anything that should behave differently while
one is held — the column hover highlight (`table-col-hover.js`) flickering across columns under a
dragging pointer is the likely first customer. Nothing else is planned on it; it is cheap to have.

### 3.6 Deferred: auto-scroll

Holding a drag at the table's edge does not scroll it. A range too wide or tall for the screen is
made from the keyboard, where `Ctrl+Shift`+arrow is exactly that job, or by scrolling with the wheel
while the button is held and moving the pointer once. Worth adding if missed; not worth building
before it is.

---

## 4. Copying (step 2 — decisions still open)

- **What copying puts on the clipboard.** TSV is what a spreadsheet expects, but a cell's text may
  itself contain a tab or a newline, and a list cell is one comma-joined line. Decide the escaping
  rule, and whether a second flavour (`text/html`, or gypsum's own) is written alongside so that a
  paste back into gypsum can be exact where a paste into Excel is merely reasonable.
- **Whether the copied text is the cell's text or its value.** The cell rules say a cell shows the
  note's own text; copy almost certainly follows, but it needs saying, because it decides what
  paste receives.
- **What a range may cross.** Probably anything — reading is safe — so an info column, a locked
  column, a mismatched cell and a linked column are all inside a range and all copied, even though
  paste will refuse to write most of them. **Step 1 already assumes this**: every body cell can be
  a corner. If copy decides otherwise, it filters; the range itself does not change.
- **Which keys are taken.** `Ctrl/Cmd+C` must not fire while a cell is open for editing, where it
  belongs to the caret. The same holds for every key in step 1: `handleKeyboardNavigate` already
  returns for a `contenteditable` cell, so `Shift`+arrow inside an open cell stays text selection
  with no extra code.
- **With no range, `Ctrl+C` copies the focused cell** — a range of one — so the key does something
  predictable wherever focus is in the table.

---

## 5. Tests

Level 2, in the spec that covers keyboard navigation and cell selection — none of this writes a file
until paste.

- A press and release in one cell still selects and, on the second press, opens it; a drag to
  another cell opens nothing, and nor does a drag that returns to its start.
- `Shift`+arrow and `Ctrl+Shift`+arrow produce the expected `tableRange` and leave focus on the
  anchor; a plain arrow clears it and moves from the anchor.
- The overlay's box matches the union of the corner cells' boxes, after a column resize too.
- A drag started on a `[[link]]` makes a range rather than dropping it.

The sticky-boundary case (§3.3) is a screenshot, level 3.
