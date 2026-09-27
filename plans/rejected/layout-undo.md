# Rejected: layout changes on the table's undo stack

Status: **rejected**
Date: 2026-09-27

---

## What it would have been

The table's undo stack holds **note edits only**: each entry is a list of `{before, after}` splices,
and undo writes `before` back where a note still says `after`. Deleting a linked column changes no
note — only `.gypsum/table_layouts.gypsum` — so it is not on the stack, and a user reasonably expects
Ctrl+Z to bring it back.

The proposal was a second kind of entry, for the layouts file, covering every layout operation that
**throws away something saved** — each of which already asks first:

| Operation | What it loses |
|---|---|
| Delete a linked column | its definition, and its place in every layout |
| Delete a layout | a whole saved arrangement |
| Delete all layouts | every layout, type, flowchart option and linked column |
| Remove from layout (a keyless column) | its place, width and position in that layout |
| Forget a type (the types modal's bin) | a saved type |

Left out on purpose: hide, reorder, resize and stick (unsaved, and "reset columns" is their undo);
rename or switch a layout, set a type, change a flowchart option, add or edit a linked column (redoing
them reverses them). "Save layout" over the active one was borderline — a silent overwrite, but a
deliberate act, and "un-save" is an odd idea.

### How it would have worked

The note undo's own rule, applied to the layouts document:

- An entry records the **slice of the document** an operation changed — one layout, one linked
  definition, one type, or the whole file for "delete all" — with its value before and after, and a
  `kind` for `describeBatch()` (`"mine" layout delete`, `due type forget`). `edits` stays empty.
- Undo writes `before` back **only where the file still holds `after`**, so a stale entry is as safe
  as a stale note edit: undoing a layout delete after a new layout has taken the name is refused.
- One reverser for all five, called from `reverseBatch()` on those kinds. Ctrl+Z, redo, the undo
  list, the horizon and `undo.gypsum` would need only a validation check for the new shape.
- **The one exception**: a deleted linked column's key can be reused (`nextLinkedKey()` takes the
  first free number), and a refused undo there would lose the column for good, since no mark records
  it the way a refused note edit is marked. So it would be restored under the next free key, its
  layout entries rewritten to match.

## Why not

**Mission creep, and not needed now.** It is a nice-to-have that is not worth its complexity:

- It makes the undo stack hold something other than note edits for the first time — a second kind
  of entry, a second reverser, a second shape to validate in `undo.gypsum`, and an exception for
  linked keys. The stack's whole design, and its tooltip ("undo last cell edit"), assumes notes.
- **Every one of these operations already asks before it runs**, and none of them touches a note.
  Nothing in anyone's files is ever lost by them; the worst case is re-making a column or a layout.
- Undo exists on the table to protect the notes. The layouts file is the app's own settings, and a
  confirmation is proportionate protection for it.

Revisit if losing a layout or a linked column turns out to be a real, repeated annoyance rather than
an expectation.
