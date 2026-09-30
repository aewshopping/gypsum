# Plan: paste into a range in table view

Status: **not started — ready to start.** Its dependencies are built.
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
- **There can be no paste button to match the copy button.** `execCommand('paste')` is refused to web
  pages, and `navigator.clipboard.readText()` asks for a permission and a secure context, which
  `file://` may not be. So paste is keyboard-only unless that is judged worth its prompt — **decide
  this** (§3). The copy menu is not the place for it either way.

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
    headings. Pasted back, it would be written as values. Decide whether the popover's "copy with
    headers" is only for leaving gypsum, or whether paste offers to skip a first line that matches
    the target columns' headings (§3).

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
  as a nudge when any refused — `output-report.js`, beside `reportCopied()`.
- **Not "12 cells selected" while a range stands**: rewriting that line on every cell a drag crosses
  costs a layout of the page each time. The copy plan found this and left it out.

---

## 3. Decisions still open

- **All-or-nothing, or write what you can.** The central decision. The likely answer is: write what is
  writable, skip the refusals **in place** — keeping the rectangle's alignment, so the rest lands
  where it was aimed — and say afterwards exactly what was skipped and why.
- **What the warning says and when it appears.** The threshold (any multi-cell paste, or only above
  some count), and whether the dialog names the skipped cells — "12 cells, 2 of them locked" is worth
  more than "are you sure". `showWarningModal()` is the dialog; the counts come from `appState` and
  `isEditable()`, so it opens at once, as the column delete's does.
- **A `'shape'` arrival.** A pasted list landing in a column of single values (or the reverse) would
  add or destroy the note's brackets, which a cell edit is not allowed to do. Skip it in place with
  the other refusals, or write it and leave it marked. Skipping matches what a cell's caret does.
- **Clipboard smaller than the range.** Fill the range once and leave the rest, or tile the clipboard
  to fill it (what a spreadsheet does for exact multiples). One copied cell pasted over a whole
  selected column is the case that makes tiling worth it.
- **Clipboard larger than the range.** Truncate to the range, or grow past it — and if it grows, what
  happens at the bottom of the page or the last column, where there is nothing more to write into.
  A single focused cell (no range) must grow, or pasting a block from a spreadsheet does nothing.
- **A paste button**, needing clipboard permission (§2.2), or keyboard only.
- **A headings line** from "copy with headers" (§2.3): skip it when it matches, or leave that to the
  user.

---

## 4. Where it goes

- `ui/ui-functions-cell/cell-range-paste.js` — **new**: the `paste` handler, the target cells, the
  refusals, the confirmation, and the one `applyCellEdits()` call. Registered in
  `event-listeners-add.js` beside `handleRangeCopy`.
- `services/tsv.js` — **new**: parsing TSV, and copy's `field()` moved in beside it, so the quoting
  rule is written once for both directions. Pure, and tested in node (`appModule()` in
  `tests/helpers.js`) — quoted tabs, quoted newlines, doubled quotes, a trailing newline.
- `cell-editor.js` — export `isEditable()`.
- `table-undo/describe-batch.js` — the `paste` kind's name.
- `output-report.js` — `reportPasted()`.

---

## 5. Tests, and how to write them

- **The write is level 1**: pasted text reaches the right key of the right note, refusals are skipped
  in place, one undo reverses the whole paste. That is a user's notes, so it runs on every change.
- **What the table does is level 2**, in `tests/2-behaviour/59-table-range-select.spec.js`.
- **A test can make a paste without the clipboard**: dispatch
  `new ClipboardEvent('paste', { clipboardData: dt })` with a `DataTransfer` holding the text, on
  the focused cell. Copy's tests read what was copied by wrapping `DataTransfer.prototype.setData`;
  the same file already does that.
- **Keep every pointer move inside the window** — headless Chromium delivers none outside it, so a
  drag through an off-screen column never crosses a cell. That read as an app bug twice while
  building range select. The range spec's window is 1,800px wide for this reason.
