# Snagging list

Small fixes and tidy-ups, one commit per bullet. A checked box means it is done and the
note underneath says how; an unchecked box with a note means it needs a decision or more
work than the snag implies. The previous list, all of it settled, is
`plans/completed/snagging-list-1.md`.

- [x] **A held row move needs releasing when focus goes nowhere.** Editing a cell holds the row
  where it is and moves it when focus leaves the row —
  `ui-functions-table/pending-row-move.js`. The path it missed was a click on the page away from the
  table that lands on nothing focusable: focus left the row, the row stayed put, and it took a
  second click into something that *could* take focus before the move happened.
  **The question was the wrong one, as you said.** `releaseRowMove` asked whether the focus that had
  just arrived was outside the row, and a click on an unfocusable part of the page is focus arriving
  nowhere — the cell is blurred to the body and no `focusin` fires at all. It now asks where focus
  *is*: `rowFor(held).contains(document.activeElement)`, which is `:focus-within` from the other
  side and needs no event to answer. The argument is gone with it, so nothing can ask the old
  question by accident.
  **Two doors, both arrivals.** The focusin handler still asks, and a click anywhere on the page now
  asks as well — registered in `event-listeners-add.js` after the click delegate, so an edit that
  the same click closes has already been handed to the write. `focusout` would have been one door
  rather than two, and is exactly what CLAUDE.md says not to do: a handler that redraws the list on
  the way out makes the browser abandon the focus move in flight. Unconditional on every click,
  because a click that opens a cell and types nothing writes nothing and re-asks nothing — the ask
  is cheap and returns immediately unless a row is actually waiting.
  `tests/1-data/49-table-cell-writing.spec.js` covers it by clicking `#output-report`, the report
  line above the table, which takes no focus. Checked against the old code first: the test fails
  there and passes here, and the three cases already covered — the hold, the release into another
  row, and the searchbox click that is a write and a departure in one gesture — still pass.

- [x] **The column menu's sort labels should read in the column's own terms.** "sort A-Z" and
  "sort Z-A" are right for text and wrong for everything else. They now read **A to Z** for text,
  **old to new** for a date and **few to many** for a list, with the opposite pair on the
  descending item, and the hyphen is a "to" in every case — a direction rather than a range.
  **The pair of words belongs to the type**, as `sortEnds` beside each entry's label in
  `VALUE_TYPES` (`constants.js`), not to a list of special cases kept in the menu. So a new type
  names its own ends where all its other facts live, and the menu composes the sentence:
  `nameSortItems()` in `ui-functions-click/column-menu.js` writes both items when the menu opens,
  beside the code that already decides which items are inert for this column. It asks
  `propertyType()` rather than the schema, so a column the user has retyped reads in its new terms.
  `lastModified` comes out right for free — an info column still holds a date, so it offers old to new.
  The static labels in `index.html` are the text wording, which is what an unopened menu reads as.
  **Numbers deliberately have no pair yet** — `NUMBER` carries no `sortEnds`, and a type without one
  borrows text's, so a number column still says A to Z. That was the open question in this bullet
  and it stays open: say the word and "low to high" / "high to low" is one line in `constants.js`.
  Checked by screenshot on a date column and a list column, and by test in
  `tests/2-behaviour/40-column-menu.spec.js`.

- [x] **A "date and time" type, now that last modified carries a time.** `datetime`, labelled
  "date and time", sits beside `date` in `VALUE_TYPES` and appears in the type dialog and the column
  picker without either being told about it — both build themselves from that list, which is what
  makes adding a type cheap.
  **What the two date types share, they share through one question.** `isDateType()` in
  `constants.js` is what ordering, `typeMismatch()` and "which cell opens a picker" all ask, so the
  difference between them stays in the two places it is real: the picker the cell opens, and the
  drawing the column wears. A date and a date-and-time are already ordered by the same number —
  `compareByProperty` sorts both by `getTime()` — so the comparator gained a case beside `date`
  rather than a branch of its own.
  **The picker is the point of the type.** A `datetime` cell opens the same editor with
  `type="datetime-local"`, seeded `2026-03-01T14:30` from the cell's own text, and writes back what
  the browser hands it — the browser's spelling rather than one of ours. `toIsoDate` gained the time
  half and still uses local getters, never `toISOString()`, which would shift the hour of every
  value it touched. Nothing in the write path needed changing: that text is not a number, so
  `needsQuoting()` leaves it alone and the parser reads it straight back, which
  `tests/1-data/48-yaml-value-write.spec.js` now states.
  **The glyph is its own drawing** — the calendar smaller, with a clock in the corner that frees —
  rather than the date one with a mark added, because the two are told apart at 16px. `LOCK_SHIFT`
  has its entry, so a locked column of this type composes like the rest. Checked magnified and at
  header size against the plain calendar.
  **And `lastModified` is now this type in the schema**, which was the decision this bullet left
  open. It changes nothing on screen — an info column draws the info glyph and takes no caret, and
  it still sorts old to new — but the column does show a time, and the schema now says so rather
  than claiming a plain date.

- [ ] **Gather every SVG icon into one block of symbols at the top of the page.** Some icons already
  follow the symbol/`use` pattern and some are drawn inline where they are used; the symbols that
  exist are themselves scattered — a group near the top of `index.html`, and others further down
  beside the modals they belong to. All of them should be defined once, together, at the top, and
  every use site should be a `<use href="#icon-…">`. Currently 44 `<svg>` elements in the file.
  **The trap is the double viewBox.** An inline `<svg>` carries its own `viewBox`, and the symbol it
  becomes carries one too — nesting a `use` of a `viewBox`-bearing symbol inside a `viewBox`-bearing
  `<svg>` scales and offsets the drawing a second time, which moves and resizes icons in ways that
  are easy to miss one at a time. The existing symbols do not share one viewBox either (`0 0 50 50`,
  `5 5 45 48`, `0 0 66.3 64.5`, `0 0 82.2 79.5`), so each conversion keeps its own. Check the result
  by screenshot, icon by icon, rather than by reading the markup — and note that the type glyphs are
  composed deliberately from two `<use>` elements and must not be flattened while tidying.

- [ ] **Opening a file from the table should animate from the row, not from the link.** The modal
  animates out of whatever was clicked — `handleOpenFileContent` hands the click target straight to
  `openFileContent` as `animateFrom` — and in the table that target is the small "open" link inside
  the file cell (`renderOpenFileLink`). The row is what stands for the file, so the row is what the
  modal should grow out of and shrink back into: `.note-table[data-vt-id]`, which is already the
  element everything else in the table addresses a row by.
  Two details to keep: `openFileContent` reads `data-fileId` and `data-color` off the element it is
  given, and the row carries `data-color` but not `data-file-id` — so either the row gains one or
  the handler takes the ids from the link and the element from the row. And the way back goes
  through `findFileCard`, which looks for `[data-action="open-file-content-modal"][data-file-id]`;
  it has to find the same element the open animated from, or the close animates to the link while
  the open animated from the row.
  **List view is deliberately unchanged** — its open control stays the transition element it is
  today.

- [ ] **List view should render property values the way the table does.** Each property in the list
  view is rendered ad hoc — `render-file-list-list.js` walks the file object's own keys and prints
  `${value}` for anything that is not a Map or a nested object — so a date, a number and a list all
  read as whatever JavaScript prints for them, and nothing is escaped. It should use the same
  rendering the table uses (`ui-functions-table/render-cell-value.js`), so a value reads the same
  wherever it is seen and a property's type means something in both views. **Render only** — no
  cells, no carets, nothing editable — so it is `renderCellValue` that is shared, not the row
  builder or the cell machinery around it.
  Three exceptions, all deliberate:
  - **`internalId` shows its value**, not an open-file link. In the table that column *is* the way
    to open a note, which is why its cell holds a link and refuses a type; here the list already
    has its own "open" control and the id should read as the id.
  - **Plainer styling is fine.** The filename should not be italic here, though `renderFilename`
    draws it that way for the table.
  - **A list's items still get their CSS custom highlight**, as in the table —
    `ui-functions-highlight/list-highlight.js`, whose `itemRangesIn()` is already the one answer to
    where an item begins. That needs the same comma-joined single line the table cell holds, and the
    same `data-list` mark on whatever element carries it.
  Where a rendering function has to change to serve both, change the function rather than writing a
  second one — the point of the snag is that there is one answer to "what does this value look
  like".
