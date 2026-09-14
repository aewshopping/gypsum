# Plan: range select and copy in table view

Status: **not started — and should not start yet.** Depends on the undo stack (see below).
Branch: `claude/table-range-select-copy-paste-iq6tcf`
Depends on: `plans/table-undo-stack.md`, **not built**
Related: `plans/table-range-paste.md`, which depends on this

---

## 1. What this delivers

Selecting a rectangular range of table cells, and copying its contents to the clipboard with
`Ctrl/Cmd+C`.

**In scope:** click-and-drag to select a range; `Shift`+arrow to extend one cell at a time and
`Ctrl/Cmd+Shift`+arrow to extend to the edge of the block; copy to clipboard.

**Explicitly out of scope:** pasting (that is `plans/table-range-paste.md`), non-rectangular or
multiple selections, selecting whole rows or columns by their headers, dragging a fill handle.

### 1.1 Why the undo stack comes first

Copy writes nothing, so it needs no undo of its own — but the selection model it introduces is what
paste then writes through, and a fifty-cell paste with no way back is not shippable. Building the
selection first and the safety net second means the dangerous half arrives before the net. The undo
plan also already assumes a pasted range in its write signature (`applyRawEdits` taking a list), so
its shape is the one to build against.

---

## 2. Key decisions to settle before writing code

- **Where the range lives.** `appState` is the only store, but a drag updates it on every
  `pointermove` — decide whether the anchor and focus cells go in `appState` and re-render, or
  whether the visible outline is a class the drag handler moves and `appState` learns the result on
  `pointerup`. The table's re-render is a full redraw; a redraw per mouse move is not free.
- **How a range and the selected cell relate.** Today "selection follows focus" is the whole rule
  and a cell wears one mark. A range is a second mark over many cells while focus is still in one of
  them — decide whether the anchor is a new concept or just "the cell focus was in when the range
  started", and what a plain click does to an existing range.
- **What copying puts on the clipboard.** TSV is what a spreadsheet expects, but a cell's text may
  itself contain a tab or a newline, and a list cell is one comma-joined line. Decide the escaping
  rule, and whether a second flavour (`text/html`, or gypsum's own) is written alongside so that a
  paste back into gypsum can be exact where a paste into Excel is merely reasonable.
- **Whether the copied text is the cell's text or its value.** The cell rules say a cell shows the
  note's own text; copy almost certainly follows, but it needs saying, because it decides what
  paste receives.
- **What a range may cross.** Decide whether an info column, a locked column or a mismatched cell
  can be *inside* a copied range (probably yes — reading is safe) even though paste will refuse to
  write them.
- **Which keys are taken.** `Ctrl/Cmd+Shift`+arrow and `Ctrl/Cmd+C` must not fire while a cell is
  open for editing, where those keys belong to the caret.
