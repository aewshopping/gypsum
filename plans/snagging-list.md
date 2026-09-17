# Snagging list

Small fixes and tidy-ups, one commit per bullet. A checked box means it is done and the
note underneath says how; an unchecked box with a note means it needs a decision or more
work than the snag implies. The previous list, all of it settled, is
`plans/completed/snagging-list-1.md`.

- [ ] **A held row move needs releasing when focus goes nowhere.** Editing a cell holds the row
  where it is and moves it when focus leaves the row —
  `ui-functions-table/pending-row-move.js`, working well. The path it misses is a click on the page
  away from the table that lands on nothing focusable: focus leaves the row, the row stays put, and
  it takes a second click into something that *can* take focus — the searchbox, say — before the
  move happens. The release hangs on `focusin`, and a click on an unfocusable part of the page
  fires no `focusin` at all, which is the whole of the bug: the question being asked is "has focus
  arrived outside the row", where the one worth asking is "is focus still inside the row" —
  `:not(:focus-within)` in pseudo-code.
  Two things constrain the fix. `focusout` is the obvious second door and it is the one the cell
  editor deliberately does not use — a handler that touches the DOM on the way out makes Chrome
  abandon the focus move in flight (see CLAUDE.md, "Collapse on arrival, never on the way out"), so
  a release that re-renders from `focusout` risks the same class of bug. And the hold is only taken
  when focus is still in the row at the time of the write, because clicking the searchbox is the
  departure and the write in one gesture — whatever door is added must not break that case, which
  is covered by test already.

- [ ] **The column menu's sort labels should read in the column's own terms.** Double-clicking a
  header offers "sort A-Z" and "sort Z-A" (`#column-menu` in `index.html`), which is the right
  wording for text and wrong for everything else. Ascending should read **A to Z** for text,
  **old to new** for a date, and **few to many** for a list; descending the reverse of each. The
  list wording is what the comparator actually does — `compareByProperty`'s `array` case sorts by
  the number of items (`file-object-sort.js`), so ascending genuinely is the shortest list first,
  and "A-Z" has never described it. And in every case the hyphen becomes " to ", so the label reads
  as a direction rather than a range.
  The labels are static HTML today; the menu already rewrites itself per column —
  `ui-functions-click/column-menu.js` disables the sort and search entries for a control column —
  so this belongs beside that, asking `propertyType()` for the type rather than reading the
  schema. The `data-tip` on each button ("sort ascending" / "sort descending") can stay as it is,
  being about direction rather than about values.
  **Open question: numbers.** "A to Z" is no better for a number column than for a date. Say if
  you want a pair for it — "low to high" / "high to low" would match the others — and it goes in
  with the rest; otherwise text's wording stands.

- [ ] **A "date and time" type, now that last modified carries a time.** The info date renders hours
  and minutes beside the date, and the table sorts dates by `getTime()`, so the time of day is
  already in the data and in the order — what is missing is a type a *note's* own property can be
  given when it holds one. Low cost and worth having: the practical difference is the editor, where
  the picker becomes a native `datetime-local` rather than a `date`
  (`ui-functions-cell/cell-date-editor.js` seeds the picker from the cell's text and writes a plain
  ISO date back, and that seeding and writing is where the work is).
  What it touches, from CLAUDE.md's rules for a new type: an entry in `VALUE_TYPES` in
  `constants.js`, a matching `#icon-type-<name>` symbol drawn like the date one is, an entry in
  `LOCK_SHIFT` in `ui-functions-render/type-glyph.js` so the locked glyph composes, `typeMismatch()`
  in `services/property-type.js` for what counts as unreadable, and the `renderDate` branch in
  `ui-functions-table/render-cell-value.js` — which for a note's own value still shows the file's
  own text, so there is less here than it looks. No migration is needed for a layouts file written
  before the type exists: an unknown name is dropped and the property falls back to the schema, and
  a file that has never heard of the new name simply does not carry it.
  **Decide while doing it:** whether `lastModified` becomes the new type. It is an info column, so
  nobody can choose its type either way, and `INFO_TYPE` sits beside the type rather than replacing
  it — the question is only which type it sits beside, and whether that changes what its cell draws.

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
