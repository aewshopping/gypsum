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

- [x] **Gather every SVG icon into one block of symbols at the top of the page.** Every icon in the
  app is now a `<symbol>` in the one sprite at the top of `index.html`, and every use site — in the
  page and in `render-table-controls.js`, which drew two of them from JS — is
  `<svg viewBox="0 0 W H"><use href="#icon-name"></use></svg>` and nothing else. The three sprites
  that had grown up beside the dialogs that used them (the settings reset, the history rows, the
  column picker's grip) moved in with the rest. 20 drawings lifted out; nothing in the page holds
  path data any more.
  **The double viewBox was real, and the check caught it.** A `<use>` with no width or height is
  100% of the outer viewport *starting at 0,0 in its coordinates*, and the symbol's own viewBox then
  maps its content onto that box — so an outer `viewBox="5 5 45 45"` repeating the symbol's own
  moved every one of those drawings up and left by five units. `0 0 45 45` outside and `5 5 45 45`
  inside is the identity. Found by pixel diff, not by eye: at 26px the shift looked like nothing.
  **The other half was CSS that reached into an icon.** A rule matching an element inside a symbol
  styles every copy of it — which is how `#save-disk-arrow` has always spun — but a rule needing an
  ancestor *outside* the icon matches nothing once the drawing lives in the sprite, because the
  copy's ancestors are the sprite's. Three did: the load button's spinning arrow, the content-search
  dot, and the highlighter pen's ink. All three now hand the value in as a custom property, which
  does inherit through a `<use>`, so the state still lives in one place in the stylesheet and the
  drawing reads it. Two drawings that were `#1e1e1e` and `black` and relied on a stylesheet to
  repaint them say `currentColor` themselves, and `.svg-wrapper-style > svg { g, path { stroke:
  currentColor } }` — which could no longer reach any icon — is gone.
  **Checked pixel for pixel**, 126 icon shots across nine surfaces (grid, table, the note, settings,
  history and column-picker dialogs, the filter row, the side panel, and the load button mid-load),
  before against after. After the viewBox fix the largest difference left is three pixels of
  antialiasing on one glyph; the load arrow's hidden and spinning states are pixel-identical, and
  the spin still runs.

- [x] **Opening a file from the table should animate from the row, not from the link.** It does now:
  `animationSource()` in `ui-functions-click/open-file-content-view-trans.js` climbs from whatever
  was clicked to its `.note-table` row, and finds nothing to climb to in any other view — which is
  how list view keeps its own open control without being told about it by name.
  **Both ends ask the same question**, which is the whole of the fix: the open passes the click
  target through it, and `findFileCard` passes what it found through it too, so the close shrinks
  back into the element the open came out of. The ids still come off the clicked element, where
  `data-file-id` and `data-color` live — only the element being animated changed.
  Checked by screenshot on the first frame of the animation: the modal used to start as a small box
  over the word "open" in the file column, and now starts as the row, full width. A test in
  `tests/2-behaviour/50-render-transitions.spec.js` watches which element wears
  `moving-file-content-view` — the row in the table, never the link, and the span in list view —
  and it fails against the old code.

- [x] **List view should render property values the way the table does.** It does: every value in
  the list is drawn by `renderCellValue`, the table's own renderer, asked for its plain form. What
  that fixed, all of it visible in one screenshot of two notes: a value holding `<b>` was being
  parsed as markup and put the rest of the list in bold, a list read `John Smith,Doe, Jane` with
  nothing to say where an item ended, `lastModified` was blank, and `color` and `errorOnLoad` said
  the word "null". A mismatched value now shows its text the way the table shows it.
  **`plain` is the one thing the renderer had to learn**, and it names the exceptions rather than
  hiding them: the file column wears an open-file link and the filename is italic *in the table*,
  because there the link is the only way to open a note. Neither is about the value, so list view —
  which has its own open control — passes `plain` and gets the id as an id and the filename as text.
  Everything that is about the value is shared, which is the point.
  **The item marks are shared too.** `updateListHighlights()` now looks for `[data-list]` rather
  than `.note-table-cell[data-list]`, so a value span that says it holds a list is banded wherever
  it is drawn; `itemRangesIn()` is unchanged and still the one answer to where an item begins.
  Nothing here is editable and nothing here reaches the cell machinery — it renders and stops.
  `tests/2-behaviour/03-view-switching.spec.js` holds the five things that were wrong, and fails
  against the old renderer.
