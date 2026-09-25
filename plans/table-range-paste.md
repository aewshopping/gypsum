# Plan: paste into a range in table view

Status: **not started — and should not start yet.** Depends on range select, which depends on the
undo stack.
Branch: `claude/table-range-select-copy-paste-iq6tcf`
Depends on: `plans/table-range-select-copy.md`, **not built** (and through it
`plans/completed/table-undo-stack.md`)

---

## 1. What this delivers

Pasting the clipboard into a selected range with `Ctrl/Cmd+V`, writing every cell it covers back to
its note's front matter in one go, behind a warning when more than one cell would change.

**In scope:** paste into a selected range; a confirmation before a multi-cell write; a defined
answer for cells that cannot take the value; a defined answer for a clipboard that is a different
size from the selection.

**Explicitly out of scope:** pasting new rows or columns into existence, formulas, paste-special
variants, importing a file.

### 1.1 Why range select comes first

Paste writes into whatever copy selects. There is nothing to paste *into* until a range exists, and
the clipboard format copy writes is the format paste has to read.

---

## 2. Key decisions to settle before writing code

- **What one paste is, to undo.** The undo plan's write already takes a list of edits per file — so
  decide that a paste is a single undo entry covering every file it touched, and that a partly
  refused paste still lands as one entry. Two dozen undos to reverse one `Ctrl+V` is the failure to
  avoid.
- **All-or-nothing, or write what you can.** The central decision, and every other answer below
  follows it. Refusing the whole paste because one cell in fifty is locked is obstructive; writing
  forty-nine and skipping one silently is worse. The likely answer is: write what is writable,
  and say afterwards exactly what was skipped and why.
- **What the warning says and when it appears.** Decide the threshold (any multi-cell paste, or
  only above some count), and whether the dialog is the place the skipped cells are named — a
  warning that can already say "12 cells, 2 of them locked" is worth more than a bare "are you
  sure".
- **Type mismatch on arrival.** `typeMismatch()` answers whether a value fits a column, but for a
  pasted value the question comes *before* the write, not after. **Half of this is now answered**:
  `mismatchRefusesCaret()` in `services/property-type.js` says which mismatches a single cell edit
  refuses, and only `'shape'` does — an `'unreadable'` value is written like any other and left
  showing as a marked cell, because it is a scalar replacing a scalar. Ask that function rather than
  testing for `'shape'` here. What is still open is a `'shape'` arrival: a pasted list landing in a
  column of single values would have to add or destroy the note's brackets, which a cell edit is not
  allowed to do — so decide whether it is skipped in place with the other refusals below, or
  written and left marked.
- **Cells that take no caret.** A locked column, an info column, and a note whose front matter did
  not read cleanly all refuse an edit today. Decide whether they are skipped in place — keeping the
  rectangle's alignment, so the rest of the paste lands where it was aimed — or whether they shift
  what follows. Skipping in place is almost certainly right, and needs saying.
- **Clipboard smaller than the selection.** Decide between filling the selection once and leaving
  the rest alone, or tiling the clipboard to fill it (what a spreadsheet does for exact multiples).
  A single copied cell pasted over a whole selected column is the case that makes tiling worth it.
- **Clipboard larger than the selection.** Decide between truncating to the selection, or growing
  the write past it — and if it grows, what happens when it runs off the bottom of the page or off
  the last column, where there are no more rows to write into.
- **Where the values come from.** The clipboard arrives as text; the note takes text. Decide
  whether a pasted cell goes through the column's type on the way in at all, or whether it is
  written as typed — the existing rule is that the promise is the text, not the value.
