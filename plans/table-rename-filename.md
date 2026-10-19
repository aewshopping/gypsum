# Plan: renaming a note from the table's filename cell

Status: **placeholder — to follow `plans/table-new-note-button.md`**

---

## Purpose

The table's new-note button makes `note-N.txt`. Everything else about a new note can then be
filled in along its row — except its name. Today that means opening the note and using the file
options dialog, which breaks the point of creating it from the table at all.

This plan makes the `filename` cell take a caret, so a note can be named — and any note renamed —
where it is listed. Closing the cell renames the file on disk the way the file options dialog
already does.

## Already decided elsewhere

- CLAUDE.md, *Column value types*: `filename` and `filepath` are kept out of `info_columns`
  deliberately, because "renaming from the table is wanted later". `filepath` stays out of this
  plan: editing it would move the file.
- CLAUDE.md, *What a table cell may contain*: to make a property editable, add the exception in
  `isPropertyEditable()` (`services/property-type.js`) — do not take it out of
  `CORE_FILE_PROPERTIES`. The writer is the real work, and for a filename it already exists:
  `editing/rename-file.js`, with `editing/rename-validate.js` for what a name may be.

## To work out when this plan is written in full

- A rename is not a front matter splice, so the cell commit needs a second path beside
  `applyCellEdits()`.
- What happens to the extension, to `[[links]]` that name the note, to the table undo stack
  (`table-undo/undo-rename.js` already rewrites ids on a rename), and to backups.
- How a refused name is shown in the cell, and how tests split between level 1 (the rename on disk)
  and level 2 (the cell).
