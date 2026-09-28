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

### 2.1 A range is two corners, and focus is one of them

**The far corner is the focused cell.** The other corner, the *anchor*, is the cell focus was in when
the range began — a new fact, but a small one. So:

- **"Selection follows focus" stays the whole rule for the selected cell.** The focused cell still
  wears the `is-selected` outline; inside a range that outline marks the corner that moves, which is
  what a spreadsheet shows too.
- **The keyboard code barely changes.** `Shift`+arrow is: set the anchor to the focused cell if
  there is no range yet, then do exactly what the arrow already does. `Ctrl+Shift`+arrow reuses the
  `Ctrl`+arrow jump unchanged, and `Shift+PageDown` extends by a page for free. Without `Shift`, an
  arrow clears the range and moves as it does today.
- **Keeping the moving corner on screen is already done.** `table-focus-scroll.js` scrolls a focused
  cell clear of the header and the sticky columns; the far corner is a focused cell, so it gets that
  for nothing.

The alternative — focus stays on the anchor and the far corner is tracked separately, as Excel does —
would need its own scroll-into-view, its own edge-jump code and its own mark, all to serve a
distinction that matters for filling a range by typing, which is out of scope.

### 2.2 Where it lives

`appState.tableRange`: `null`, or `{ anchor, extent }`, each `{ id, prop }` — a cell addressed by its
row's file id and its column, the way `keep-cell-state.js` already addresses one, never by
`data-index`, which shifts when the rows do. `extent` is the focused cell once the gesture ends; it is
stored rather than read off `document.activeElement` so copy (and later paste) read one place.

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

- A focus move that is not an extension — a plain arrow, Tab, a click in another cell, a click
  outside the table. `handleCellFocusIn` clears the range **unless** the move was made by the range
  code itself, which says so with a module flag set just before it calls `focus()` — the one door
  selection already goes through, asked one more question.
- Escape, when no cell is open (an open cell's Escape still belongs to the cell, one level at a time).
- Opening a cell (Enter, F2, a second press): the open cell is the whole of the user's attention.

---

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
- **`pointerup` / `pointercancel`** on the document — end the drag and focus the extent (with the
  flag from §2.3 so the range survives it). `preventScroll` is not needed: the extent is under the
  pointer.

**Focus does not move during the drag, only at the end of it.** Focusing each crossed cell would run
`table-focus-scroll.js` mid-drag and scroll the table under the pointer, which then puts a different
cell under the pointer. At the end the cell is where the pointer is, so the scroll has nothing to do.

Document listeners rather than pointer capture: capture set on `pointerdown` retargets the `click`
to the capturing element, which would break the click that opens a cell. If a release outside the
window turns out to be missed, capture can be taken on the *first crossing*, when there is no click
left to protect.

### 3.3 Drawing the outline: one overlay, anchored to two cells

**The range is one element with a border, not a border drawn on each edge cell.** It is positioned
with CSS anchor positioning — already used by the undo list, the tooltip and the completion popup —
between two cells:

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
```

`range-start` goes on the rectangle's **top-left** cell and `range-end` on its **bottom-right**,
worked out from the two corners' row and column positions — not on the anchor and the extent, which
can be any two opposite corners. The overlay is hidden (`display: none`) while no cell carries
`range-start`.

What that buys:

- **Painting a range is moving two classes**, whatever its size — the paint function does nothing
  else. No per-cell class on hundreds of cells, no `getBoundingClientRect`, no per-frame JS.
- **It stays right without being told.** A column resize, a sideways scroll, a row that re-renders
  in place: the browser re-resolves the anchors, and none of those code paths need to know a range
  exists.
- **A true outline of the rectangle**, which is the requirement: one border, around the outside,
  with no inner lines to suppress. Per-cell edge classes (`range-top`, `range-left`…) would reach
  the same picture with four classes and a box-shadow per side, on every cell the range touches.
- **The tint layers over the row colour** without knowing it. A row's background is
  `attr(data-color)` through `color-mix` with hover and suppressed branches (see the fade note in
  `note-table-cell.css`); a translucent layer on top sidesteps all of them, the same argument that
  made a mask attractive there — without the mask's problem, since the overlay is not the cell and
  does not eat the cell's outline.

**Where the overlay lives:** one element inside `.list-table`, the sideways scroller, given
`position: relative` so it is the containing block. Anchors inside the same scroll container as the
positioned element move with it, so no scroll compensation is asked of the browser. It is drawn by
the table renderer, so it exists while the table does, like the control row.

**Stacking:** above the rows and the sticky cells (4), below an opened sticky cell (5) and
`.table-chrome` (6), so it slides under the header like the rows. That needs a slot — renumber the
sticky layers or give the overlay 5 and the opened cell 6/chrome 7; decide when building, and update
the stacking note in CLAUDE.md with it.

**To prove first, with a screenshot, before building the rest:** a range that spans the sticky
boundary while the table is scrolled sideways. A sticky cell's offset is applied at scroll time, and
whether an anchor inside a sticky cell reports its stuck position or its laid-out one is the one
place this could draw wrong. If it does, the fallback for that case alone is to clip the overlay to
the non-sticky columns — not to abandon the approach.

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
- `Shift`+arrow and `Ctrl+Shift`+arrow produce the expected `tableRange`; a plain arrow clears it.
- The overlay's box matches the union of the corner cells' boxes, after a column resize too.
- A drag started on a `[[link]]` makes a range rather than dropping it.

The sticky-boundary case (§3.3) is a screenshot, level 3.
