# Plan: paste into a range in table view

Status: **not started.** Its dependencies are built, and every decision is made (§3).
Branch: `claude/table-range-select-copy-paste-iq6tcf`
Depends on: `plans/completed/table-range-select-copy.md`, **built** (and through it
`plans/completed/table-undo-stack.md`, **built**). Read its §2.3 and §3 first, and CLAUDE.md's
*Range selection* — this plan leans on both.

---

## 1. What this delivers

Pasting the clipboard into the table with `Ctrl/Cmd+V`, writing every cell it covers back to its
note's front matter in one go, behind a warning when more than one cell would change.

**In scope:** paste into a range, or from the focused cell; a confirmation before a multi-cell write;
a defined answer for cells that cannot take the value; a defined answer for a clipboard that is a
different size from the range.

**Explicitly out of scope:** pasting new rows or columns into existence, formulas, paste-special
variants, importing a file.

---

## 2. What range select and copy settled

These were open questions when this plan was written, or were not yet known to be questions.
Building range select and copy answered them.

### 2.1 Where to paste

- **The target is the range's rectangle, from `rangeGrid()`** in `ui-functions-cell/cell-range.js` —
  the one answer to "which cells are in the range", already shared by the marks and the copy. Its
  top-left cell is where the clipboard's first cell lands. **Never from focus**: after `Ctrl+A` the
  focused cell is somewhere inside the range, not a corner.
- **With no range, the focused cell is the top-left**, as copy treats it as a range of one.
- **A range is one page's rows**, in on-screen order, hidden columns absent. A paste never reaches
  another page.
- **Cells are addressed by `{ vtId, prop }`** (`addressOf()` in `keep-cell-state.js`), which is what
  `applyCellEdits()` needs: `internalId` is the row's `vtId`, `property` the cell's `data-prop`.

### 2.2 Reading the clipboard

- **Use the browser's `paste` event**, the mirror of copy's `copy` event, and read
  `evt.clipboardData.getData('text/plain')` synchronously. No permission, no promise, and it works
  from `file://`, where the app may run as one HTML file.
- **Prove first**, as copy did: that `Ctrl+V` fires `paste` with focus on a closed cell that is
  `user-select: none`, with nothing selected. Copy's equivalent held, so this is expected to.
- **The same guard as copy and `Ctrl+A`**: act only when focus is on a closed table cell
  (`.list-table .note-table-cell:not(.is-expanded)`). An open cell, a text box and the rest of the
  page keep the browser's paste — so pasting into an open anchor pastes text into that cell, and
  never across the range standing around it.
- **A paste button cannot work the way the copy button does.** `execCommand('paste')` is refused to
  web pages; the only read is `navigator.clipboard.readText()`, which asks for a permission and a
  secure context. Decided to have one anyway, on those terms (§3.1).

### 2.3 What arrives

- **Copy writes TSV in `text/plain` and nothing else** — no gypsum flavour was built, so a paste back
  into gypsum reads the same text a spreadsheet would. Tab between cells, newline between rows; a
  field holding a tab, a newline or a double quote is quoted, its quotes doubled, as a spreadsheet
  writes it. **The parser must undo exactly that** — a quoted field may hold a newline, so rows cannot
  be split on `\n` first. It is pure and small; it goes in `services/` beside copy's `field()`, which
  moves there with it, so the one quoting rule has one home.
- **A spreadsheet's TSV ends with a trailing newline**; gypsum's does not. Drop one trailing empty
  line, or a spreadsheet paste gains a blank row.
- **Copied values are what the cells showed.** So, from gypsum:
  - a list arrives comma-joined — `a, b` — which is exactly the text a list cell is edited as, so it
    goes back into a list column as the same items;
  - `lastModified` arrives formatted (`9/29/2026 01:15 PM`), and a date column takes it as text, as a
    typed cell would, and marks it unreadable;
  - the file column arrives as 1, 2, 3…; tags as `x, y`;
  - **"copy with headers" puts the headings on the first line**, and nothing marks that line as
    headings. Decided: a paste that starts with one is refused whole (§3.1) — "copy with headers" is
    for leaving gypsum.

### 2.4 Writing it

- **One call to `applyCellEdits()`** (`editing/save-cell-edit.js`) with the whole batch: it already
  takes a list of `{ internalId, property, text }`, the same path one cell's edit takes — types,
  quoting, a list's items, the lock, `expect`, the verified write and the one refresh. **The text is
  the promise, not the value**, as for a typed cell: nothing is re-typed on the way in beyond what a
  cell edit does. That answers the old question of "where the values come from".
- **Which cells refuse is one question, already answered**: `isEditable(cell)` in
  `ui-functions-cell/cell-editor.js` — the column may be typed into (`isPropertyEditable`), the
  value's shape fits (`mismatchRefusesCaret`), and the note's front matter read cleanly. **Export it
  rather than repeating it**, so paste and the caret cannot disagree. That covers info, locked,
  linked and control columns (the file column, tags) at once.
- **The redraw keeps the range.** A write's refresh draws the same rows in the same order, and a range
  survives that (built in step 1) — so after a paste the pasted range is still selected, and can be
  pasted over again. Nothing is re-sorted by a write.
- **A batch across many notes gets the bar and the inert table** (`setBulkWriteBusy()`), as a column
  delete and a multi-note undo do; the report line carries the progress bar, never a counting
  number (CLAUDE.md, *Progress is a bar*).
- **Undo**: one batch, one entry — `applyCellEdits()` already pushes what it writes as a batch. Give
  it a `kind` of its own (`paste`) so `describeBatch()` in `table-undo/describe-batch.js` can name it
  ("paste into 12 cells") on the undo button, the report line and the undo list.

### 2.5 Saying what happened

- **The report line** says it, as copy's "copied 8 cells" does: "pasted 12 cells", and "…, 2 skipped"
  when any refused — `output-report.js`, beside `reportCopied()`. It also carries the two refusals of
  the whole paste: a headings line, and a clipboard permission the paste button was denied.
- **Not "12 cells selected" while a range stands**: rewriting that line on every cell a drag crosses
  costs a layout of the page each time. The copy plan found this and left it out.

---

## 3. Decisions

### 3.1 Decided

- **Refusals are skipped in place, and the rest is written.** A cell that refuses keeps the
  rectangle's alignment, so everything else lands where it was aimed; the report line says how many
  were skipped (§2.5).
- **Pasted text is never the wrong type — it is written the way typing writes it.** A cell takes any
  text: `applyCellEdits()` puts it through the column's type (`toYamlText()`), so `soon` in a number
  column is written as text and the cell is marked unreadable, and `a, b` in a list column becomes a
  list in the front matter. Paste adds nothing to that: same text in, same bytes out.
- **What paste does add is a way into the cells that refuse a caret for shape.** A note holding a list
  in a column of single values — or a single value in a list column — is `'shape'`
  (`mismatchRefusesCaret`), and that cell opens to be read and no more, because a commit rewrites the
  value in the column's shape. **Paste writes over those anyway, in the column's shape**, and leaves
  the user in control: the list becomes one value (or the value a list), and one undo puts it back.
  So the refusal test is `isEditable()` minus its shape question — an option on the one function,
  `isEditable(cell, { anyShape: true })`, rather than a second copy of the other two checks (the
  column can be typed into; the note's front matter read cleanly), so the caret and the paste still
  share one answer for those.
  **Checked in the code:** over a flow list, a single-value column's write ignores the list's form —
  `toYamlText()` reads only `shape.quoted` for a scalar — and the span reaches to `valueEnd`, so the
  brackets, or a block list's item lines, go and one value is written. Nothing wraps it back into
  brackets. Prove it with a level 1 test when building.
- **Only a single copied cell repeats.** One cell on the clipboard fills every cell of the range.
  Anything larger is pasted at its own size from the range's top-left and nothing is repeated: two
  cells pasted into a six-cell range write two cells, and the other four are left alone.
- **A clipboard larger than the range is cut to the range** — the range is what the user chose to
  write. **With no range** (one focused cell) the paste grows from that cell, or pasting a block from
  a spreadsheet would do nothing; it stops at the page's last row and the last column, and whatever
  falls off is counted as skipped.
- **So the cells written are** the range when the clipboard is one cell; otherwise the clipboard's
  rectangle from the top-left, clipped to the range, or to the page with no range.
- **A paste button**, in the copy button's popover as a third item — "paste" under "copy" and "copy
  with headers" — so there is one clipboard button, shown while a range is. It reads the clipboard
  with `navigator.clipboard.readText()`, the only way a page can read it without a key press, which
  **asks the user for clipboard permission the first time** and needs a secure context (`localhost`
  and `https`; **prove** whether Chrome counts the single-file app on `file://` as one). When it is
  refused, the report line says so and names `Ctrl+V`. Everything after the read is the `Ctrl+V` path:
  one function takes the text, whichever way it arrived. Like the other items, it must not take focus
  (its `mousedown` is cancelled), and the permission prompt must be checked not to move focus off the
  cell either — if it does, the range ends before the paste can land.
- **A clipboard that starts with a headings line refuses the whole paste.** No attempt to skip the
  line. Detected when every field on the first line is a heading of a column in the table as drawn
  (`.header-label`, the text "copy with headers" writes). The report line says why: the clipboard
  starts with column headings — copy without headers to paste. That also catches a spreadsheet's
  header row when its names match the table's, which is the same mistake.

### 3.2 The warning

**Any paste that writes more than one cell asks first.** A single cell goes straight through, as
typing into it would. Everything larger opens a confirmation — two reasons: it may write notes that
are not on screen, and a batch across many notes takes time, during which the table is busy.

- **Counted from `appState`, so it opens at once**, as the column delete's does: "Paste into 12 cells
  in 6 notes? 2 cells are locked and will be skipped." `Cancel` has focus.
- **Cells that will be skipped are counted in the dialog**, and so are cells whose value changes shape
  (§3.1), so the dialog says what will not be what the rectangle suggests. Cells outside the range
  or the page (§3.1) are among the skipped.
- **The targets are worked out before the dialog opens, and the range is put back after.** Opening a
  modal moves focus out of the table, and focus moving on ends a range (`handleCellFocusIn`) — so the
  paste holds the anchor and extent, and on either button puts focus back on the anchor and restores
  the range with `extendRange()`. The same cells are written that the dialog counted.
- A heading line refuses the paste before any dialog (§3.1); nothing to confirm.

## 4. Where it goes

- `ui/ui-functions-cell/cell-range-paste.js` — **new**: the `paste` handler, the target cells, the
  refusals, and the one `applyCellEdits()` call.
- The confirmation dialog — **new**, beside the column delete's in `index.html`, with its own
  handler file in `ui-functions-click/`. Registered in
  `event-listeners-add.js` beside `handleRangeCopy`.
- `services/tsv.js` — **new**: parsing TSV, and copy's `field()` moved in beside it, so the quoting
  rule is written once for both directions. Pure, and tested in node (`appModule()` in
  `tests/helpers.js`) — quoted tabs, quoted newlines, doubled quotes, a trailing newline.
- `cell-editor.js` — export `isEditable()`, with the `anyShape` option (§3.1).
- `ui-functions-click/range-copy-menu.js` — the "paste" item, reading the clipboard and handing the
  text to the same function `Ctrl+V` uses.
- `table-undo/describe-batch.js` — the `paste` kind's name.
- `output-report.js` — `reportPasted()`.

---

## 5. Tests, and how to write them

- **The write is level 1**: pasted text reaches the right key of the right note, refusals are skipped
  in place, a list under a single-value column is written as one value (and the reverse), one cell
  fills the range while a larger clipboard does not repeat, a headings line writes nothing,
  cancelling the confirmation writes nothing, one undo reverses the whole paste. That is a user's notes, so it runs on every change.
- **What the table does is level 2**, in `tests/2-behaviour/59-table-range-select.spec.js`.
- **A test can make a paste without the clipboard**: dispatch
  `new ClipboardEvent('paste', { clipboardData: dt })` with a `DataTransfer` holding the text, on
  the focused cell. Copy's tests read what was copied by wrapping `DataTransfer.prototype.setData`;
  the same file already does that.
- **Keep every pointer move inside the window** — headless Chromium delivers none outside it, so a
  drag through an off-screen column never crosses a cell. That read as an app bug twice while
  building range select. The range spec's window is 1,800px wide for this reason.
