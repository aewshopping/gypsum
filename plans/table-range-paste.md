# Plan: paste into a range in table view

Status: **not started.** Its dependencies are built, and every decision is made (§3).
Branch: `ccr-fde5a3a7-c57w1r`
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
  a cell edit needs (`toRawEdits()`, §2.4): `internalId` is the row's `vtId`, `property` the cell's `data-prop`.

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
  be split on `\n` first. **Any line ending is a line ending**: `\r\n` (Excel on Windows), `\n`, and
  a lone `\r`, inside a quoted field as well as between rows. It is pure and small; it goes in `services/` beside copy's `field()`, which
  moves there with it, so the one quoting rule has one home.
- **A spreadsheet's TSV ends with a trailing newline**; gypsum's does not. Drop one trailing line
  ending, whichever convention it is, or a spreadsheet paste gains a blank row.
- **Rows may be of different lengths** when the text did not come from a spreadsheet. The parser
  returns them as they are and never pads them: a field that is *missing* (nothing on the clipboard)
  is a cell left alone, where a field that is *empty* (a tab with nothing after it) is a value — `''`,
  which clears the cell and so takes the key out of the note, exactly as clearing a cell by hand does.
  That is accepted: undo puts it back.
- **Copied values are what the cells showed.** So, from gypsum:
  - a list arrives comma-joined — `a, b` — which is exactly the text a list cell is edited as, so it
    goes back into a list column as the same items;
  - `lastModified` arrives formatted (`9/29/2026 01:15 PM`), and a date column takes it as text, as a
    typed cell would, and marks it unreadable;
  - the file column arrives as 1, 2, 3…; tags as `x, y`;
  - **"copy with headers" puts the headings on the first line**, and nothing marks that line as
    headings. Decided: **no guard** (§3.1). It is pasted as values like any other line.

### 2.4 Writing it

- **The same conversion one cell's edit takes, and the column delete's journalled write.** What a
  typed cell becomes — types, quoting, a list's items — is the `edits.map` at the top of
  `applyCellEdits()` (`editing/save-cell-edit.js`); split it out as an exported `toRawEdits(edits)` so
  paste uses the very same conversion. **The text is the promise, not the value**, as for a typed
  cell: nothing is re-typed on the way in beyond what a cell edit does.
- **Crash-safe, as `deleteProperty()` is — slower, and safer.** `applyCellEdits()` pushes its undo
  entry *after* the write, which is right for one cell and wrong for a paste across hundreds of notes:
  a tab closed half-way would leave overwritten values nothing records. So `editing/paste-cells.js`
  (new) is the delete's two passes with a different first argument:
  1. `applyRawEdits(toRawEdits(edits), { write: false })` — the plan; nothing touches a note.
  2. `pushUndoBatch(planned, { kind: 'paste', … , dirHandle })` and **wait for `saved`**; if the
     journal did not reach the disk, drop it and write nothing.
  3. `applyRawEdits(planned.map(r => ({ internalId, property, raw: r.after, expect: r.before })),
     { resort: false, onProgress })` — `r.after` is the whole value span the plan computed, so a list
     where one item changed still keeps the comments the item splice kept.
  4. As the delete: an empty pass drops the entry, otherwise `batch.edits = applied` and save.

  `applyCellEdits()` itself is untouched apart from the split, so one cell's edit stays one write.
  This is also the path for a one-cell paste: one code path, and a one-cell paste is no less a write
  than a large one.
- **Which cells refuse is one question, already answered**: `isEditable(cell)` in
  `ui-functions-cell/cell-editor.js` — the column may be typed into (`isPropertyEditable`), the
  value's shape fits (`mismatchRefusesCaret`), and the note's front matter read cleanly. **Export it
  rather than repeating it**, so paste and the caret cannot disagree. That covers info, locked,
  linked and control columns (the file column, tags) at once.
- **The redraw keeps the range, and the rows stay put until you leave them** — the cell edit's
  held move, widened from one row to the rows a paste wrote. See §3.3.
- **Afterwards, what a cell commit does afterwards**: `markUndoState()` to light the undo button, and
  the row hold (§3.3) — `cell-edit-commit.js:79-86` is the model. A paste that wrote nothing redraws
  with `renderFiles(false, true)`, as a commit that wrote nothing does.
- **A batch across more than one note gets the bar and the inert table** (`setBulkWriteBusy()`), as a
  column delete and a multi-note undo do — which also sets `bulkWriteInFlight`, so a folder load is
  refused and closing the tab asks first. The report line carries the progress bar, never a counting
  number (CLAUDE.md, *Progress is a bar*).
- **Making the table inert takes focus out of it**, and the paste has to put it back. The browser
  will not leave focus on an element that has become unclickable, so it moves to the page body. The
  redraw puts focus back where it was *just before the redraw* (`keep-cell-state.js`) — by then that
  is nowhere. Left alone, no cell would be focused after a large paste: `Ctrl+V` would not work again
  until a cell was clicked, and the row hold (§3.3), which asks whether focus is in a written row,
  would let every row jump at once. The paste already holds the anchor's address for the dialog
  (§3.2); after the write it focuses that cell again and restores the range with `extendRange()`.
- **Undo**: one batch, one entry, `kind: 'paste'`, with `property` set when every written cell is in
  one column and `null` otherwise — the same rule `applyCellEdits()` uses for `edit`. Named by
  `describeAction()` in `table-undo/describe-batch.js` the way an edit is, so the two read alike:
  `status paste` for one column, `paste of 12 values` for several; `describeBatch()` then adds
  ` in 6 files` as it does for everything. A refused undo's issue text (`values`, not `edits`) reads
  the same way.

### 2.5 Saying what happened

- **The report line** says it, as copy's "copied 8 cells" does: "pasted 12 cells", then the two kinds of
  cell not written, **counted separately because they mean different things**: "2 locked" — cells
  that refuse (§3.1) — and "96 didn't fit" — clipboard cells past the page's edge (§3.1). So:
  `pasted 12 cells, 2 locked, 96 didn't fit`, each part only when it is not zero. `output-report.js`,
  beside `reportCopied()`. It also carries the one refusal of the whole paste: a clipboard permission
  the paste button was denied.
- **Not "12 cells selected" while a range stands**: rewriting that line on every cell a drag crosses
  costs a layout of the page each time. The copy plan found this and left it out.

---

## 3. Decisions

### 3.1 Decided

- **Refusals are skipped in place, and the rest is written.** A cell that refuses keeps the
  rectangle's alignment, so everything else lands where it was aimed; the report line says how many
  were skipped (§2.5).
- **Pasted text is never the wrong type — it is written the way typing writes it.** A cell takes any
  text: `toRawEdits()` puts it through the column's type (`toYamlText()`), so `soon` in a number
  column is written as text and the cell is marked unreadable, and `a, b` in a list column becomes a
  list in the front matter. Paste adds nothing to that: same text in, same bytes out.
- **What paste does add is a way into the cells that refuse a caret for shape.** A note holding a list
  in a column of single values — or a single value in a list column — is `'shape'`
  (`mismatchRefusesCaret`), and that cell opens to be read and no more, because a commit rewrites the
  value in the column's shape. **Paste writes over those anyway, in the column's shape**, and leaves
  the user in control: the list becomes one value (or the value a list), and one undo puts it back.
  So the refusal test is `isEditable()` minus its shape question. In `cell-editor.js`, the two
  checks they share (the column can be typed into; the note's front matter read cleanly) become one
  private `isWritable(cell)`, and two exported questions are built on it: `isEditable(cell)` — that
  and the shape — for the caret, and `isPasteable(cell)` — that alone — for paste. One answer for
  what they share, and each name says what it is for.
  **A one-cell paste needs no warning for this either**: undo puts it back, and the user meant it.
  Into a list column a one-cell paste is written as a list — a list of one item, if that is what the
  text is — because the text goes through the column's type like any typed cell.
  **Checked in the code:** over a flow list, a single-value column's write ignores the list's form —
  `toYamlText()` reads only `shape.quoted` for a scalar — and the span reaches to `valueEnd`, so the
  brackets, or a block list's item lines, go and one value is written. Nothing wraps it back into
  brackets. Prove it with a level 1 test when building.
- **Only a single copied cell repeats.** One cell on the clipboard fills every cell of the range.
  Anything larger is pasted at its own size from the range's top-left and nothing is repeated: two
  cells pasted into a six-cell range write two cells, and the other four are left alone.
- **Nothing is ever written outside the selected range.** A clipboard larger than the range is cut to
  it — the range is what the user chose to write — and those cells are not counted anywhere: trimming
  to a range you drew is not a failure. **With no range** (one focused cell) the paste grows from that
  cell, or pasting a block from a spreadsheet would do nothing; it stops at the page's last row and
  the last column, and whatever falls off is reported as "didn't fit" (§2.5).
- **A short row writes only the fields it has** (§2.3): a missing field leaves its cell alone.
- **So the cells written are** the range when the clipboard is one cell; otherwise the cells of the
  range — or of the page, with no range — that a clipboard field lands on.
- **A paste button**, in the copy button's popover as a third item — "paste" under "copy" and "copy
  with headers" — so there is one clipboard button, shown while a range is. It reads the clipboard
  with `navigator.clipboard.readText()`, the only way a page can read it without a key press, which
  **asks the user for clipboard permission the first time** and needs a secure context (`localhost`
  and `https`; **prove** whether Chrome counts the single-file app on `file://` as one). When it is
  refused, the report line says so and names `Ctrl+V`. Everything after the read is the `Ctrl+V` path:
  one function takes the text, whichever way it arrived. Like the other items, it must not take focus
  (its `mousedown` is cancelled), and the permission prompt must be checked not to move focus off the
  cell either — if it does, the range ends before the paste can land.
- **No guard against a headings line.** Any test for one refuses something real — a single cell
  holding the word `status` is a heading match — and a refused paste the user meant is worse than a
  headings row pasted by mistake, which is visible at once and one undo away. Pasting is the user's
  act and the user's responsibility.

### 3.2 The warning

**Any paste that writes more than one cell asks first.** A single cell goes straight through, as
typing into it would. Everything larger opens a confirmation — two reasons: it may write notes that
are not on screen, and a batch across many notes takes time, during which the table is busy.

- **Counted from the cells on screen, so it opens at once**: "Paste into 12 cells in 6 notes? 2 cells
  are locked and will be skipped." `Cancel` has focus. Unlike the column delete's, which counts notes
  in `appState`, the facts paste needs — is this cell locked, does it hold a list where the column
  wants one value — are written on each drawn cell (`data-mismatch`, `data-yaml-error`), and every
  target is on screen, because a paste never leaves the page. Nothing is read from disk to count.
- **The dialog says what will not be what the rectangle suggests**: cells locked (skipped), cells
  whose value changes shape (§3.1), and cells that didn't fit (§2.5), each only when not zero.
- **The targets are worked out before the dialog opens, and the range is put back after.** Opening a
  modal moves focus out of the table, and focus moving on ends a range (`handleCellFocusIn`) — so the
  paste holds the anchor and extent, and on either button puts focus back on the anchor and restores
  the range with `extendRange()`. The same cells are written that the dialog counted.

### 3.3 Holding the rows still

**The rows a paste wrote stay where they are until focus leaves all of them**, outlined as a single
edited row is today — the same class (`move-pending`), the same CSS, the same release. Paste a whole
page and nothing moves until you click outside the table: you can see what you pasted, and nothing
jumps under you.

- **`appState.pendingRowMove` becomes a Set of ids** rather than one id. That is the whole change to
  `pending-row-move.js`, and it is small: `holdRowMove(ids)` takes the written ids; the rows that
  sorting would move wear the outline; the hold stands while `document.activeElement` is inside *any*
  written row, and `releaseRowMove()` asks that same question. A single cell edit passes a Set of one
  and behaves exactly as now. The other two readers change one test each:
  `render-table-rows.js:111` asks `.has()`, and `sortAppStateFiles` clears the Set.
- **"Any written row", not "any outlined row"**, so arrowing from an outlined row to a written row
  that did not need to move keeps the hold. Moving within the pasted rows ends the range (focus moving
  on always does), but not the hold.
- **The write passes `resort: false`**, as `cell-edit-commit.js` does; the hold is asked after the
  write's own render, and only after focus is back on the anchor (§2.4), or it would release at once.

## 4. Where it goes

- `ui/ui-functions-cell/cell-range-paste.js` — **new**: the `paste` handler, the target cells, the
  refusals and the counts, the dialog, the busy state, and everything after the write — focus back
  on the anchor and the range restored (§2.4), `markUndoState()`, `holdRowMove()` over the written
  ids (§3.3), `reportPasted()`, and the `renderFiles(false, true)` when nothing was written.
- `editing/paste-cells.js` — **new**: the journalled two-pass write (§2.4).
- `editing/save-cell-edit.js` — `toRawEdits()` split out of `applyCellEdits()` and exported.
- `ui-functions-table/pending-row-move.js` — the held move over a Set of rows (§3.3), and its two
  other readers.
- The confirmation dialog — **new**, beside the column delete's in `index.html`, with its own
  handler file in `ui-functions-click/`. Registered in
  `event-listeners-add.js` beside `handleRangeCopy`.
- `services/tsv.js` — **new**: parsing TSV, and copy's `field()` moved in beside it, so the quoting
  rule is written once for both directions. Pure, and tested in node (`appModule()` in
  `tests/helpers.js`) — quoted tabs, quoted newlines, doubled quotes, a trailing newline, `\r\n` and
  lone `\r` endings, rows of different lengths, an empty field against a missing one.
- `cell-editor.js` — `isWritable()` private, `isEditable()` and `isPasteable()` exported (§3.1).
- `ui-functions-click/range-copy-menu.js` — the "paste" item, reading the clipboard and handing the
  text to the same function `Ctrl+V` uses.
- `table-undo/describe-batch.js` — the `paste` kind's name (§2.4).
- `output-report.js` — `reportPasted()`.

---

## 5. Tests, and how to write them

- **The write is level 1**: pasted text reaches the right key of the right note, refusals are skipped
  in place, a list under a single-value column is written as one value (and the reverse), one cell
  fills the range while a larger clipboard does not repeat, nothing lands outside the range, a
  missing field leaves its cell alone while an empty one clears it, cancelling the confirmation
  writes nothing, one undo reverses the whole paste, and a journal that cannot be saved means
  nothing is written.
- **The held rows are level 2**: after a paste with the table sorted by last modified, the written
  rows stay put while focus is in any of them and move once it leaves the table. That is a user's notes, so it runs on every change.
- **What the table does is level 2**, in `tests/2-behaviour/59-table-range-select.spec.js`.
- **A test can make a paste without the clipboard**: dispatch
  `new ClipboardEvent('paste', { clipboardData: dt })` with a `DataTransfer` holding the text, on
  the focused cell. Copy's tests read what was copied by wrapping `DataTransfer.prototype.setData`;
  the same file already does that.
- **Keep every pointer move inside the window** — headless Chromium delivers none outside it, so a
  drag through an off-screen column never crosses a cell. That read as an app bug twice while
  building range select. The range spec's window is 1,800px wide for this reason.
