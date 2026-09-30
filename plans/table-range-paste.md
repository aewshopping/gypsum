# Plan: paste into a range in table view

Status: **not started.** Its dependencies are built; one decision is open — the warning (§3.2).
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
- **A wrong shape is written anyway.** A list landing in a column of single values, or the reverse, is
  written and left for the user to deal with — the user has control. **This means the refusal test is
  not quite `isEditable()`**: that also refuses a cell whose value is the wrong shape
  (`mismatchRefusesCaret`), which is right for a caret and wrong here. So paste asks the other two of
  its three questions — the column can be typed into (`isPropertyEditable`), and the note's front
  matter read cleanly — and not the shape one. Put that as an option on the one function
  (`isEditable(cell, { anyShape: true })`) rather than a second copy of the other two checks, so the
  caret and the paste still share one answer for them. **To prove first:** what `applyCellEdits()`
  writes when the text for a single-value column lands on a key holding a list — it keeps "the
  note's own style" at a key, and a flow list's style must not wrap the text back into brackets.
- **A smaller clipboard repeats to fill the range.** Cell (r, c) of the range takes clipboard cell
  (r mod rows, c mod columns), so one copied cell fills a whole range, a copied row fills every row,
  and a 2-row clipboard over 5 rows gives 1, 2, 1, 2, 1. Always by modulo — including a partial last
  repeat, which is where this differs from a spreadsheet (those tile only exact multiples). Easy to
  narrow to exact multiples later if the partial repeat surprises.
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

### 3.2 Still open: the warning

Undo already reverses a whole paste in one step, and every refusal is safe. The question is how
much stands in front of a paste as well. The options:

- **A. No confirmation.** Paste writes at once; the report line says what it did, and one `Ctrl+Z`
  reverses it. What a spreadsheet does. Fastest, and undo is a real safety net here — journalled,
  and refused only where a note has changed since.
- **B. Confirm above a size.** A dialog when the paste reaches more than one cell (or more than some
  number of cells or notes), with counts from `appState` so it opens at once: "Paste into 12 cells
  in 6 notes? 2 cells are locked and will be skipped." `Cancel` has focus, as in the column delete's.
  The price is a dialog on every multi-cell paste — the ordinary case for a range.
- **C. Confirm only when values would be lost.** A dialog only when the paste overwrites cells that
  hold something (filling empty cells goes straight through). Needs a pre-pass comparing each target
  cell's current value with its new text — cheap, from `appState`. Closer to the risk, but the rule
  is harder to predict.
- **D. Confirm only when something will be skipped or a shape is wrong.** The ordinary paste goes
  straight through; the dialog appears when the result will not be what the rectangle suggests.

A reasonable pairing is **A for a paste within the visible cells and B above a threshold** — for
instance, more notes than fit on screen, where the user cannot see everything being written.

### 3.3 Still to settle when building

- **A clipboard larger than the range.** With no range (one focused cell), the paste must grow from
  that cell, or pasting a block from a spreadsheet does nothing; it stops at the page's last row and
  the last column, and whatever falls off is counted as skipped. With a range, the proposal is to
  truncate to it — the range is then what the user chose to write. Confirm when building.

---

## 4. Where it goes

- `ui/ui-functions-cell/cell-range-paste.js` — **new**: the `paste` handler, the target cells, the
  refusals, the confirmation, and the one `applyCellEdits()` call. Registered in
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
  in place, a wrong shape is written, a repeat fills the range, a headings line writes nothing, one
  undo reverses the whole paste. That is a user's notes, so it runs on every change.
- **What the table does is level 2**, in `tests/2-behaviour/59-table-range-select.spec.js`.
- **A test can make a paste without the clipboard**: dispatch
  `new ClipboardEvent('paste', { clipboardData: dt })` with a `DataTransfer` holding the text, on
  the focused cell. Copy's tests read what was copied by wrapping `DataTransfer.prototype.setData`;
  the same file already does that.
- **Keep every pointer move inside the window** — headless Chromium delivers none outside it, so a
  drag through an off-screen column never crosses a cell. That read as an app bug twice while
  building range select. The range spec's window is 1,800px wide for this reason.
