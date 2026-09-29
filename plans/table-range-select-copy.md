# Plan: range select and copy in table view

Status: **step 1 (selecting a range) built. Step 2 (copy) not started — §3 is its plan.**
Branch: `claude/table-range-select-copy-paste-iq6tcf`
Depends on: `plans/completed/table-undo-stack.md`, **built**
Related: `plans/table-range-paste.md`, which depends on this

---

## 1. What this delivers

Selecting a rectangular range of table cells, and copying it with `Ctrl/Cmd+C`.

1. **Selecting a range** — built. §2 records what it became and what was learned; the rules to hold
   are in CLAUDE.md, *Range selection*, and that is where to read them.
2. **Copying it** — §3.

**Out of scope:** paste (`plans/table-range-paste.md`), non-rectangular or multiple selections,
selecting by row or column header, a fill handle. **Not designed for touch**: a finger drag scrolls
the table, and the range handlers ignore `pointerType === 'touch'`.

The undo stack came first because the selection is what paste will write through, and a fifty-cell
paste with no way back is not shippable.

---

## 2. Step 1, as built

### 2.1 What it does

- **Making a range:** drag from one cell to another; `Shift`+arrow, `Ctrl+Shift`+arrow and
  `Shift+PageDown` from the focused cell; shift-click, and a shift-drag that re-sizes an existing
  range from the same anchor; `Ctrl/Cmd+A` for every cell drawn on this page. A drag held at the
  table's edge auto-scrolls, and a wheel scroll mid-drag grows the range.
- **Continuing it:** `Shift`+arrow always carries on from the range's far corner, whether the range was
  made by keys or a drag, and however many times `Shift` was let go.
- **Keeping it:** opening the focused cell (F2, Enter, a second press) keeps the range — the open cell
  is where a range-wide value will be typed — and so does the redraw after the cell is written.
  Escape steps back one level: the open cell, then the range.
- **Ending it:** focus moving to another cell or out of the table; Escape with no cell open; a press
  outside the table; a redraw that is full or draws different rows (sort, filter, page, columns).
  Focus moving *within* a cell — a date cell's input and picker button — does not end it.

### 2.2 The model

`appState.tableRange` is `null` or `{ anchor, extent }`, each a cell address `{ vtId, prop }` —
`keep-cell-state.js`'s `addressOf()`/`elementAt()`, reused. **The anchor is where the range grows
from, and nothing that makes a range moves focus.** A drag, a shift-click and `Shift`+arrow anchor at
the focused cell; select-all anchors at the top-left and leaves focus where it was, so **focus is not
always a corner of the range** — the one fact about the model that step 2 has to respect (§3.1).

### 2.3 What was learned, and would be got wrong again

- **Marks must be paint-only.** Each cell in the range carries `in-range` and the edge cells
  `range-top/bottom/left/right`, drawn as inset `box-shadow`s and a `background-image` tint. One
  element drawn round the range (by anchor positioning or by `grid-area`) drew correctly but was
  measured at 55ms a move on a 1,000-row page (p95 over 110ms): moving anything inside `.list-table`
  lays the whole grid out again. The cell marks measured 2–5ms however many rows. No throttling is
  needed; Chrome delivers `pointermove` once a frame.
- **A cell has one shadow list.** The sticky columns' edge line became the named layer
  `--sticky-edge`, which the range appends to its own list; an open cell is left out of the marks and
  keeps its own drop shadow. The edge rules name `.in-range` too, or its zeroes win in some rule orders
  (the prototype drew a tint and no border).
- **`click` already tells a click from a drag**: the browser fires it only where press and release
  land on the same element. Only a drag that returns to its start, and a shift-click, need
  `pressMadeRange()` to stop the click opening the cell.
- **The press can't be in `pointerDownActionHandlers`.** The delegate stops at the nearest
  `data-action`, and a `[[link]]`, a tag pill or the file link inside a cell has its own — a drag begun
  on one never started. It is a document listener beside `handleCellPointerDown`.
- **Links must not be draggable** (`-webkit-user-drag: none`), or the browser's link drag cancels the
  pointer; and closed cells are `user-select: none`, or a drag also selects text.
- **A shift-click must not move focus**, and only cancelling the `mousedown` default stops it —
  `pointerdown`'s does not.
- **The browser counts a cell under the sticky header or the sticky columns as on screen.**
  `revealCell()` scrolls both clear, measuring `.table-chrome`'s bottom edge (there is no height
  variable for the header strip), and runs on focus, on the far corner moving and on a cell opening.
- **Auto-scroll speed is pixels, not rows**: 2–30px a frame. One to five rows a frame, as first
  planned, is 2,400px a second at the slowest.
- **A test drag must stay inside the window.** Headless Chromium delivers no pointer moves outside
  it, so a drag through an off-screen column never crosses a cell — which read as an app bug twice.

### 2.4 Where it lives

`ui/ui-functions-cell/cell-range.js` (the range, the marks, select-all), `cell-range-drag.js` (the
pointer), `cell-range-autoscroll.js` (edge scrolling and the clamped hit test), and
`css/note-table-range.css`; small edits in `keyboard-navigate.js` (one `targetIndex()` for focus and
extent), `keyboard-shortcuts.js` (Escape, `Ctrl+A`), `cell-expand.js`, `table-focus-scroll.js`,
`a-render-all-files.js` and `event-listeners-add.js`. Tests are in
`tests/2-behaviour/59-table-range-select.spec.js`; the auto-scroll was checked by driving the app,
by decision.

---

## 3. Step 2: copying

### 3.1 What is copied

- **The rectangle from `appState.tableRange` — never from focus.** After select-all the focused cell
  is somewhere inside the range, not a corner. With no range, the focused cell alone: a range of one.
- **In on-screen order**: rows as drawn on this page, columns as drawn, hidden columns absent. That is
  the order the paint already walks (row position in `.list-table`, cell position in its row), so the
  copy walks the same way rather than re-deriving it from the layout.
- **Not the cells' on-screen text.** That was the plan's first thought, and it is wrong for every
  column that draws markup: a tags cell is a row of pills with no separator, so its text reads
  `workproject`; the file column reads `open`; `internalLink` draws targets without brackets. **Reuse
  `sourceValue()` and `copyText()` from `editing/copy-source-value.js`**, which "copy column…" already
  uses to turn any column — front matter, core or linked — into text. Pure and tested; the range copy
  gets the same answer the column copy does. A front matter list comes out comma-joined, as its cell
  shows it.
- **Decide the file column (`internalId`).** Its value is an id nobody sees. Copy the filename in its
  place, or leave the column's cells empty — "copy column…" refuses it outright (`NOT_COPYABLE`),
  which a range cannot do without breaking its rectangle.
- **Anything else can be copied**: info, locked, mismatched and linked cells alike. Reading is safe;
  paste decides what it will write.

### 3.2 The clipboard

- **Use the `copy` event, not `navigator.clipboard`.** A `copy` listener can set several flavours
  synchronously through `clipboardData.setData()`, with no permission prompt and no promise. The
  async API asks for a secure context, and the app also ships as a single HTML file that may be opened
  from `file://`. **To prove first:** that `Ctrl+C` fires `copy` when focus is on a closed cell with
  `user-select: none` and nothing is selected. If Chrome skips it, the fallback is to handle the
  keydown and call `document.execCommand('copy')` from it, which fires `copy` regardless.
- **TSV in `text/plain`**, which is what a spreadsheet reads: tab between cells, newline between rows.
  A value holding a tab, a newline or a double quote is wrapped in double quotes with its quotes
  doubled, as Excel writes it.
- **Whether to write a second flavour for gypsum's own paste** — `text/html` carrying the values
  exactly, or a custom type — is paste's question as much as copy's. Decide it with
  `plans/table-range-paste.md` rather than here; `text/plain` alone is enough to ship copy.

### 3.3 Keys and feedback

- **`Ctrl/Cmd+C` only from a closed table cell**, the same guard `Ctrl+A` has
  (`.list-table .note-table-cell:not(.is-expanded)`), so an open cell, the search box and the rest of
  the page keep the browser's copy. With the anchor open and the range still standing, `Ctrl+C` copies
  the open cell's selected text, not the range.
- **Say it was copied.** Nothing on screen changes otherwise. The report line (`#output-report`) can
  say "copied 12 cells" the way undo reports there; a brief flash of the copied cells could reuse
  `table-undo-flash.css`. Pick one — the report line is the smaller.
- **Size.** `Ctrl+A` then `Ctrl+C` on a full 1,000 × 40 page is 40,000 values. Reading them from the
  file objects touches no layout; measure once, but it should be well under a frame's worth per
  thousand.

### 3.4 Where it goes

One new file, `ui/ui-functions-cell/cell-range-copy.js`: the rectangle's cells, their values through
`copy-source-value.js`, the TSV, and the `copy` handler — registered in `event-listeners-add.js`
beside the other document listeners. `cell-range.js` exports the rectangle it already works out for
the paint (top, bottom, left, right), so the copy and the marks cannot disagree about which cells are
in the range. The TSV quoting is small and pure; if paste needs to read it back, it moves to
`services/` then, not before.

### 3.5 Tests

Level 2, in `59-table-range-select.spec.js`: a range including a tags cell and a list cell copies
their items rather than their pills; select-all copies from the top-left whatever cell holds focus;
`Ctrl+C` in an open cell copies text, not the range.
