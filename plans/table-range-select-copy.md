# Plan: range select and copy in table view

Status: **step 1 (selecting a range) built. Auto-scrolling a drag (§6) planned, not built. Step 2
(copy) not started.**
Branch: `claude/table-range-select-copy-paste-iq6tcf`
Depends on: `plans/completed/table-undo-stack.md`, **built**
Related: `plans/table-range-paste.md`, which depends on this

---

## 1. What this delivers

Selecting a rectangular range of table cells, and copying it with `Ctrl/Cmd+C`. Two steps, and the
first stands on its own:

1. **Selecting a range** (§2–§5), and **scrolling the table while a drag is held at its edge** (§6), a
   refinement added after step 1 was built. Nothing is written or copied.
2. **Copying it** (§7). Reads the range step 1 leaves in `appState`.

**In scope:** press in a cell and drag to another; `Shift`+arrow to extend one cell at a time and
`Ctrl+Shift`+arrow to extend to the end of the row or column — today's arrow and `Ctrl`+arrow with
`Shift` held; copy to the clipboard.

**Not designed for touch.** A finger drag scrolls the table, as now. The range handlers ignore
`pointerType === 'touch'`, so a finger never paints half a range before the browser takes the
gesture for a scroll. Anything else a touch screen gets is a bonus.

**Out of scope:** paste (`plans/table-range-paste.md`), non-rectangular or multiple selections,
selecting by row or column header, a fill handle, shift-click.

The undo stack came first because the selection is what paste will write through, and a fifty-cell
paste with no way back is not shippable.

---

## 2. The range model

**The anchor is the focused cell, and the range grows away from it**, as in a spreadsheet. The far
corner, the *extent*, is the only new fact.

- **"Selection follows focus" is untouched.** The anchor keeps its `is-selected` outline inside the
  range, and a plain arrow moves from it — exactly today's behaviour.
- **A mouse drag never moves focus.** The press focuses the start cell natively, as it does today;
  the drag moves only the extent.
- **`Shift`+arrow moves the extent, never focus, and always continues the range there is.** With no
  range the extent starts at the anchor; with one, it moves on from where it is, however the range
  was made: release `Shift`, press it again, and the same range grows or shrinks. `Ctrl+Shift`+arrow
  carries on from the same corner, after a `Shift`+arrow or a drag. Pressing a modifier alone does
  nothing — only the things in the list below end a range.
- **A range of one cell is no range**: when the extent comes back to the anchor, the range is
  cleared, so "is there a range" is one test.

**Stored as `appState.tableRange`**: `null`, or `{ anchor, extent }`, each a cell address
`{ vtId, prop }` — the shape `keep-cell-state.js` already uses, so its `addressOf()` and
`elementAt()` are exported and reused rather than written again. The anchor is stored even though it
is always the focused cell, so that copy (and later paste) read one place.

**What ends a range**, all through one `clearRange()`:

- **Any focus move** — a plain arrow, Tab, a press in a cell, a press outside the table. One line in
  `handleCellFocusIn`, the door selection already goes through. Nothing the range does moves focus,
  so nothing needs exempting.
- **Escape**, beside `finishOpenCell(true)` in the Escape branch of `keyboard-shortcuts.js`.
- **Opening a cell** (Enter, F2, a second press) — one line in `expand()`.
- **Any render that replaces the rows.** One line in `renderFiles`' `doRender`, where
  `captureCellState()` already runs. The new rows carry no marks anyway, and the only redraws that
  would happen during a range are ones this list already ends it for.

---

## 3. The pointer

**A drag is a press whose pointer reaches a different cell before it is released.** No distance
threshold: the grid is the threshold, and a wobble within a cell is still a click.

**Opening a cell stays on `click`**, because the browser already fires `click` only when the press
and release land on the same element. Pressed in A and released in B, the click goes to their shared
row, which has no `data-action`, so `expand-cell` is never reached and the two-press cycle is
untouched.

**One case the browser does not cover**: pressed in A, dragged to B, released back in A. That is a
click on A, and would open it if A was already focused. So the drag records that it crossed a cell,
and `handleCellExpand` returns early when it did — beside `pressWasOnSelectedCell()`, which exists for
the same reason: the press knows something the click cannot.

- **Start** — primary button, not touch, on a closed cell. A press inside an open cell belongs to the
  caret. Records the start cell; focus arrives on it natively.
- **Move** — returns at once unless a drag is under way, then finds the cell under the pointer and
  **does nothing unless it is a different cell from last time.** On a crossing, the extent moves and
  the range is repainted.
- **End** (`pointerup`, `pointercancel`) — ends the drag. Focus is already on the anchor.

**Focus never moves during a drag**, which also keeps the table still under the pointer: focusing
each crossed cell would run `table-focus-scroll.js` and scroll a different cell under it.

**Text selection and link dragging.** Closed cells get `user-select: none`, or a drag paints the
browser's own text selection over the range; an open cell keeps its own, which is the caret's. And
`-webkit-user-drag: none` on links in the table, because pressing and moving on an `<a href>` starts
the browser's link drag, which cancels the pointer stream and would end the range from any cell
holding a `[[link]]`, the file link or a tag pill.

---

## 4. The keyboard

In `keyboard-navigate.js`, which is already where the arrow keys are.

- **The arithmetic is lifted into one function**, from a key and an index to a target index —
  including `Ctrl`'s jump to the end of the line and `PageDown`. A plain arrow asks it from the
  focused cell's index and focuses the result, as now; `Shift`+arrow asks it from the extent's index
  and moves the extent. The edge rules exist once.
- **`Shift` applies only in the table.** On cards, `Shift`+arrow keeps doing what an arrow does.
- **The extent is scrolled into view by hand**, since no focus move does it. `table-focus-scroll.js`
  already brings a cell clear of the sticky columns sideways; that body becomes an exported
  `revealCell(cell)`, called by its own `focusin` handler as now and by the range code. Then
  `scrollIntoView({ block: 'nearest', inline: 'nearest' })` for the vertical: the cells' existing
  `scroll-margin` keeps it clear of the header, and horizontally it is already a no-op.
- `handleKeyboardNavigate` already returns for an open cell, so `Shift`+arrow inside one stays text
  selection with no extra code.

---

## 5. Drawing it

**Each cell in the range carries `in-range`, and the cells on its edges `range-top`,
`range-bottom`, `range-left`, `range-right`.** CSS draws a 2px inset `box-shadow` on each marked
side, so only the outside of the rectangle is outlined, and a translucent `background-image` tints
the whole range:

```css
.note-table-cell.in-range {
    --rt: 0px; --rb: 0px; --rl: 0px; --rr: 0px;
    background-image: linear-gradient(var(--range-tint), var(--range-tint));
    box-shadow: inset 0 var(--rt) var(--colour-contr), inset 0 calc(-1 * var(--rb)) var(--colour-contr),
                inset var(--rl) 0 var(--colour-contr), inset calc(-1 * var(--rr)) 0 var(--colour-contr),
                var(--sticky-edge, 0 0 transparent);
}
.note-table-cell.in-range.range-top    { --rt: 2px; }
.note-table-cell.in-range.range-bottom { --rb: 2px; }
.note-table-cell.in-range.range-left   { --rl: 2px; }
.note-table-cell.in-range.range-right  { --rr: 2px; }
```

- **The edge rules name `.in-range` too**, so they outrank its zeroes in any rule order. In the
  prototype they came first and the zeroes won: the tint drew and no border did.
- **The sticky edge is kept by naming it.** The last sticky column draws the line where the sticky
  columns end as a `box-shadow` on each of its cells, and a cell has one shadow list, so the range's
  would replace it. `note-table-sticky.css` sets that value once as `--sticky-edge` on
  `.is-sticky-last` and draws `box-shadow: var(--sticky-edge)`; the range appends the variable to its
  own list. Prototyped with the table scrolled sideways: the range's border draws, and the sticky
  line runs unbroken down every row, through the range too. The opened cell's drop shadow cannot meet
  a range, since opening a cell ends one. No other cell sets a `box-shadow`.
- **The tint layers over the row colour** without knowing it: a `background-image` paints above
  whatever `background-color` the row's colour branches set.
- **It sits beside the anchor's outline**, since `outline` and `box-shadow` are separate properties.

**The paint function** takes the anchor's and extent's row and column — from DOM positions, never
from geometry, so nothing forces a layout mid-gesture — works out the rectangle (anchor r1 c3 to
r5 c1 is r1–r5 × c1–c3), clears the marks from the cells it marked last time and marks the new ones.
So the border lies on cell boundaries and jumps a cell at a time. The pointer is only ever asked
which cell it is over.

**Performance: no throttling, and the simple repaint is enough.** Measured in a Chromium prototype
with the table's `subgrid` rows and 20 columns, including style and layout: under 2ms per cell
crossing at 50 rows, 2.6ms at 1,000 (p95 5ms), against a 16ms frame. The marks are paint-only, so no
layout runs however many rows the page holds. Chrome delivers `pointermove` at most once a frame, and
a move within a cell costs a `closest()` and a comparison. Marking a whole 1,000 × 40 page at once
took about half a second — so if a range that size is ever felt to lag on each further `Shift`+arrow,
the fix is to change only the cells whose marks differ. Not before.

**Why not one outline element.** A single element pinned to the range's corners with anchor
positioning (or placed on the grid lines with `grid-area`) drew correctly, sticky case included. But
moving any element inside `.list-table` makes Chrome lay out the whole table grid again: 55ms per
crossing at 1,000 rows, p95 over 110ms. A page can hold 1,000 rows. Recorded here so it is not tried
again.

---

## 6. Auto-scrolling a drag (refinement — planned, not built)

**The problem.** Focus stays on the anchor, so nothing scrolls the table as a drag grows the range
down or right. Two gaps, and both need closing:

1. **Scrolling does not update the range.** When the content moves under a still pointer no
   `pointermove` fires, so the range does not change until the mouse moves — even when the user
   scrolls with the wheel mid-drag.
2. **Nothing scrolls on its own.** The browser's own edge auto-scroll belongs to text selection,
   which the range turns off with `user-select: none` (§3).

**The keyboard already scrolls**: `Shift`+arrow reveals the far corner with `revealCell()` and
`scrollIntoView({ block: 'nearest' })`. One gap to check, not assumed: going *up*, a cell under the
sticky header probably counts as on screen to the browser and is not scrolled to. If so, a
`scroll-margin-top` on the cells equal to the header's height is the fix. It is one CSS line and
plain arrow-up focus would get it too. Confirm with a test before adding it.

### 6.1 What it does

Spreadsheet behaviour. **While a drag is under way and the pointer is in a strip about 40px wide
inside any edge of the visible table, or anywhere past that edge, the table scrolls every frame**,
faster the further in or past the pointer is. After each step, the cell under the pointer is
found again and the range extends to it.

- **The edges:**
  - **Top:** the bottom of `.table-chrome`, the sticky header the rows scroll up under.
  - **Bottom:** the bottom of the window.
  - **Right:** the right edge of `.list-table`.
  - **Left:** the right edge of the sticky columns. Pointing at a sticky cell has to target that
    cell, not scroll, so the strip starts where the sticky columns end. The cost is a narrow strip
    of ordinary cells there that scrolls when the user meant to point at it; accepted.
- **What scrolls:** the window up and down, since the page is what scrolls vertically, and
  `.list-table`'s `scrollLeft` sideways.
- **Speed:** from about one row a frame at the strip's inner edge to about five rows a frame well
  past it, capped. The exact numbers are a matter of feel once it runs; they are two constants,
  not settings.
- **A pointer outside the table still means a cell.** Before asking which cell is there, the
  pointer's position is clamped into the table's visible area, so dragging below the window or
  past the right edge targets the edge row or column. Today a drag off the table targets nothing
  and the range stops where the pointer left it.
- **It stops** when the pointer leaves the strips, when scrolling can go no further in that
  direction (the last row on the page, since a range never spans pages; either end of the table
  sideways), and on `pointerup` or `pointercancel`.

### 6.2 How

**One new module, `ui/ui-functions-cell/cell-range-autoscroll.js`**, beside `cell-range-drag.js`,
which drives it:

- **`cell-range-drag.js` keeps the pointer's last position** (`clientX`/`clientY`) on every move,
  and hands it to the autoscroll. Its move handler's "which cell is under the pointer" becomes the
  clamped hit test below, shared by both. There is still one hit test.
- **The hit test** is `document.elementFromPoint()` at the clamped position, then `closest()` for
  the cell. It is only acted on when the cell differs from the last one, as now, so the range is
  repainted once per cell crossed, never once per frame.
- **The loop** is a `requestAnimationFrame` loop, started when the pointer enters a strip and
  stopped as in §6.1. One frame is: work out the speed on each axis from the pointer's distance into
  or past the strips, scroll, then run the hit test.
- **Wheel scrolling during a drag** is covered by the same hit test: a `scroll` listener on the
  window and on `.list-table`, added when a drag starts and removed when it ends, runs the hit test
  at the last pointer position. The loop's own scrolling fires these listeners too, so the loop may
  not need to run the hit test itself. Decide which one owns it when building; not both.
- **No new registration in `event-listeners-add.js`.** The loop and the two scroll listeners live
  only as long as a drag, so `cell-range-drag.js` starts and stops them. That matches how the rest
  of a drag already hangs off the document listeners registered there.

**Cost.** Each frame reads `.list-table`'s and `.table-chrome`'s positions, which is cheap because
the range's marks never make layout dirty (§5). The repaint happens only on a cell crossing, at the
2–5ms measured in §5.

**Size.** About 50 lines in the new module and a few in `cell-range-drag.js`. If that turns out
bigger than it should, the fallback is to ship only the scroll listener (gap 1, about 15 lines). The
user can then scroll with the wheel while dragging, and the loop can be added on top later without
throwing anything away.

### 6.3 Tests

Level 2, in `59-table-range-select.spec.js`:

- A drag held past the bottom of the window scrolls the page and extends the range to a row that
  was off screen when the drag started, with focus still on the anchor.
- A drag held past the table's right edge scrolls `.list-table` sideways and extends the range into
  a column that was off screen.
- Scrolling with the wheel mid-drag, the mouse otherwise still, extends the range.
- Releasing stops the scrolling: `scrollY` does not change after `pointerup`.

---

## 7. Copying (step 2 — decisions still open)

- **The clipboard format.** TSV is what a spreadsheet expects, but a cell's text may hold a tab or a
  newline, and a list cell is one comma-joined line. Decide the escaping rule, and whether a second
  flavour (`text/html`, or gypsum's own) goes alongside so a paste back into gypsum can be exact.
- **The cell's text, not its value** — almost certainly, since a cell shows the note's own text; it
  decides what paste receives, so it needs saying.
- **A range may cross anything.** Reading is safe, so info, locked, mismatched and linked cells are
  all copied, though paste will refuse to write most of them. Step 1 already assumes this: any body
  cell can be a corner.
- **`Ctrl/Cmd+C` goes in `keyboard-shortcuts.js`**, beside the other `Ctrl` keys, and must not fire
  while a cell is open, where it belongs to the caret.
- **With no range, it copies the focused cell** — a range of one.

---

## 8. Where the code goes

Two new JS files and one new CSS file; everything else is a small edit to the file that already owns
that concern. Nothing is duplicated: each piece that already exists is exported and reused.

| File | New or edited | What |
|---|---|---|
| `ui/ui-functions-cell/cell-range.js` | **new** | The range itself: `extendRange(cell)`, `clearRange()`, and the paint. Beside `cell-expand.js`, which owns the single-cell mark; this owns the many-cell one. |
| `ui/ui-functions-cell/cell-range-drag.js` | **new** | The pointer gesture: start, move, end, and whether the last press crossed a cell. Separate from `cell-range.js` because the keyboard uses the range and not the drag. |
| `ui/ui-functions-cell/cell-range-autoscroll.js` | **new** (§6, not built) | The edge auto-scroll loop and the drag-time scroll listeners, started and stopped by `cell-range-drag.js`. |
| `css/note-table-range.css` | **new** | The marks (§5), `user-select` on closed cells, `-webkit-user-drag` on the table's links, the `--range-tint` token. Imported in `style.css` beside `note-table-sticky.css`. |
| `ui/ui-functions-click/keyboard-navigate.js` | edited | The arithmetic becomes one function; the `Shift` branch calls `extendRange()`. |
| `ui/ui-functions-click/keyboard-shortcuts.js` | edited | `clearRange()` in the Escape branch. |
| `ui/ui-functions-cell/cell-expand.js` | edited | `clearRange()` in `handleCellFocusIn` and `expand()`; the crossed-a-cell check in `handleCellExpand`. |
| `ui/ui-functions-table/table-focus-scroll.js` | edited | Body exported as `revealCell(cell)`. |
| `ui/ui-functions-render/keep-cell-state.js` | edited | `addressOf()` and `elementAt()` exported. |
| `ui/ui-functions-render/a-render-all-files.js` | edited | `clearRange()` in `doRender`. |
| `css/note-table-sticky.css` | edited | The edge shadow's value moves into `--sticky-edge`. |
| `ui/event-listeners-add.js` | edited | Registration (§9). |
| `services/store.js`, `DATA-STRUCTURES.md` | edited | `tableRange: null`, and its entry. |
| `CLAUDE.md` | edited | A short *Range selection* section (the model, the paint-only marks and why, the named sticky shadow) and the file map rows. |

**Nothing goes in `services/`**: there is no business logic, only which cells are marked, and the
rectangle is two `Math.min`/`Math.max` pairs inside the paint function — not worth a helper used once.

---

## 9. Registration, following the app's conventions

- **The press is a document listener beside `handleCellPointerDown`, not an entry in
  `pointerDownActionHandlers`.** The plan first said the map, since the cell carries
  `data-action="expand-cell"` — but the delegate stops at the *nearest* `data-action`, and a `[[link]]`,
  a tag pill or the open-file link inside a cell carries its own, so a drag begun on one would
  never start. Found while writing the test for it. `handleCellPointerDown` is a document listener for the same reason.
- **The rest of the drag is registered like every other drag in the table** (column reorder, column
  resize, the scrollbar): document `pointermove`, `pointerup` and `pointercancel` listeners in the
  block headed "The rest of a drag cannot be reached by data-action", each returning unless a drag is
  under way.
- **Keys are not registered anywhere new.** `keyDownDelegate` → `handleKeyboardShortcuts` →
  `handleKeyboardNavigate` already carries every arrow; the `Shift` branch lives inside that last
  function, and Escape inside the second. Its early returns — autocomplete first, then an open
  cell's editor — are what keep these keys out of an open cell.
- No inline handlers, no new `data-action` values.

---

## 10. Tests

Level 2, in the spec that covers keyboard navigation and cell selection — nothing here writes a file.

- A press and release in one cell still selects, and on the second press opens; a drag to another
  cell opens nothing, nor does a drag that returns to its start.
- `Shift`+arrow and `Ctrl+Shift`+arrow give the expected range and leave focus on the anchor; a plain
  arrow clears it and moves from the anchor.
- A range is continued, not restarted, by the next `Shift`+arrow after `Shift` is released, and after
  a drag.
- A drag started on a `[[link]]` makes a range rather than being cancelled.
