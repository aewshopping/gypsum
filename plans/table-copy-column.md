# Plan: copy a column into every note

Status: **skeleton** — the approach is recommended (§3), the open questions are listed (§5), and
nothing is built.
Related: `plans/completed/table-linked-properties.md` §10, which recorded this as "later: writing the
linked value back"; `plans/completed/table-delete-column.md` and
`plans/completed/table-rename-column.md`, whose machinery this reuses.

---

## 1. What this delivers

"copy column…" in a column's menu writes that column's value, row by row, **into a property of each
note** — a new property, or one that already exists, overwriting it.

The reason for it is the linked column. A linked column is worked out afresh on every render and
lives in no note, so nothing else can read it: not gypsum's own search, not sorting (until
linked-properties §9), not Obsidian. Copying it turns "Project status" into a real `project_status:`
key in every task note.

**Any column can be copied**, since the write is the same once the values are in hand: duplicating
`status` into `status_old` before a bulk edit, or `title` into a front matter `title:` key.

### 1.1 How often a linked column changes

A linked column is **evaluated on every render of the visible rows**, and nothing is stored
(linked-properties §3.5). So it is always live: edit `status` in a project note and every row linking
to it shows the new value on the next redraw. A copy is therefore a **snapshot** taken when "copy" is
pressed. Pressing it again later brings the notes up to date, and that re-copy is the common case this
plan is optimised for (§3.2).

---

## 2. What already exists

- **`applyRawEdits`** is the one writer for every table batch. An edit is `{internalId, property,
  raw}`, where `raw` may be a function of the note's existing shape, so the note's own quoting and list
  style is kept (`plan-file-edits.js`). It replaces a key's value span, appends a key the note does
  not have, or removes one (`raw: ''`).
- **An edit that would change nothing is dropped** (`plan-file-edits.js`: `raw === before` returns
  no splice), so a note already holding the value is not written.
- **The journalled two-pass write** from the column delete: a plan pass with `write: false` yields
  every note's `before`; the undo batch is pushed and `undo.gypsum` written; then the write pass runs
  with `expect: before`. That is crash-safe, and it refuses a note edited in between.
- **Locked notes are never written**, for every caller.
- **The busy table, the progress bar and the report line** are shared with the delete and the rename
  (`setBulkWriteBusy`, `reportProgress`).
- **The forecast** (`property-forecast.js`) counts from `appState`, so a dialog opens at once.
- **`linkedValue()`** works on any file, not only the visible rows, so a copy can reach every note.

---

## 3. The approach: one overwrite pass, not copy → delete → rename

### 3.1 Why not copy, then delete, then rename

Copying to a placeholder, deleting the old column and renaming the placeholder is **three journalled
batches**: about three writes per note, three undo entries, and two moments where an interrupted run
leaves the folder half-way (two copies of the value, or none). It also only exists because rename
refuses to merge. None of that is needed.

### 3.2 Recommended: write the target key directly, in one batch

Copying into `target` is, for each note, **one edit to one key**: replace `target`'s value span with
the source value, append `target` if the note lacks it, or remove it if the source is empty (§5.3).
That is exactly the edit a cell commit makes, sent for every note at once through `applyRawEdits`,
using the delete's journalled two passes:

1. **Plan pass** (`write: false`) over every note whose value would change. The dropped-no-op rule
   removes every note that already holds the value.
2. **Push the undo batch** (`kind: 'copy-property'`) and wait for `undo.gypsum`.
3. **Write pass** with `expect: before`.

Why this is fast and safe:

- **One write per note that actually changes, and none for the rest.** A first copy into a new
  property writes every note that has a value. A **re-copy writes only the notes whose value moved** —
  1,000 tasks where 20 project statuses changed is 20 writes, not 1,000. The delete measured about
  4s for 1,000 notes, so a first copy should cost about the same, and a re-copy almost nothing.
- **One undo entry** puts back every overwritten value, byte for byte, including values that were
  there before the first copy.
- **Crash-safe with no new code**: a tab closed half-way leaves a journal whose unapplied edits are
  refused on undo, exactly as for the delete.
- **A note edited between the passes is refused**, not overwritten with a stale plan.
- **Overwriting needs no special path.** Replacing an existing value span is what every cell edit
  already does; the only new thing is the warning (§4.2).

### 3.3 What each source writes

To be settled in §5, but the shape is:

- **A front matter column**: the source key's value span, **byte for byte**, as the rename re-creates a
  key. The quoting, flow or block style and item comments come across unchanged, and nothing is
  re-serialised.
- **A linked column**: `linkedValue()` for that note, written through `toYamlText` in the target's
  existing shape (one value → a scalar, several → a list).
- **A core column** (`title`, `filename`, `tags`, `lastModified`…): its value as text — tags as a
  list of names, a Date as ISO. Some of these may simply not be offered (§5.1).

### 3.4 A linked column: where it differs

§3.2 holds for a linked column, and holds most strongly there: copy → delete → rename does not even
apply, because a linked column has no key in any note to delete or rename. But five things are
different from copying a front matter column, and each shapes the build:

1. **It is written out as text, not copied byte for byte.** A front matter column carries its source
   bytes across. A linked value has no bytes in the note being written — it comes from other notes —
   so it goes through the same formatting a cell edit uses (`toYamlText`).
2. **Skipping unchanged notes depends on the text matching exactly, not just the value.** The writer
   skips a note when the new text is identical to what is already there. A re-copy formats each
   value the same way every time, so an unchanged value gives identical text and is skipped. A value
   someone restyled by hand since (added quotes, say) is rewritten in the app's style — harmless,
   but a write. **The cheap re-copy rests on this, so it gets a level-1 test** (§7).
3. **The protection covers the note being written, not the notes the values come from.** `expect:
   before` refuses to write a task note that changed during the copy. It does not watch the project
   notes the values are read from, so a project edited while the copy runs can leave a task with the
   old value. Accepted: a copy is a snapshot of the moment it was pressed, and pressing again puts it
   right. It is a weaker guarantee than the check gives the note itself, and the plan says so rather
   than implying otherwise.
4. **Every value is worked out once, before anything is written.** All the linked values are
   computed in the plan pass, from the file objects as they stand, and the write pass only writes
   them. That is what keeps one copy consistent: worked out during the writes instead, a note already
   written could change what the next note reads.
5. **Copying into the property the column reads from gives a different result each time.** An edge
   case, but a real one. Tasks A → B → C, each linking to the next, with a linked column "show
   `status` of the note linked in `next`". Copy it into `status` itself: A takes B's status and B
   takes C's. Press again and A takes B's *new* status — C's, two links along. Each press moves the
   values one more link down the chain, so a re-copy never settles, which defeats what "copy again"
   is for. It happens only when the target is the column's own `read` property and notes link to
   notes of the same kind. Copying "project → status" into a new `project_status` settles at once,
   because writing `project_status` never changes what the column reads. **So the column's `read`
   property is refused as a target**, beside its `via` property (§5.5).

---

## 4. The dialog

### 4.1 Choosing where to copy to

From "copy column…" in the column menu. One text box for the target name, with the folder's own
properties offered as suggestions (a `<datalist>`), and a line under it that says which of two things
will happen, stacked in one cell like the rename dialog's:

- **a new name**: `creates "project_status" in 35 notes`. The name goes through
  `property-name.js`'s rules, since it becomes a key.
- **an existing property**: `writes "status" in 35 notes — overwrites 12 values, clears 3`.

### 4.2 The overwrite warning

When any value would be overwritten or cleared, the button names it (`overwrite 12 notes`) and a
confirmation follows, **cancel focused**, as for "delete column". A copy into a new property, or one
that only adds values, needs no second question: nothing is lost, and undo takes it back either way.

### 4.3 After the write

The target column appears, visible and rightmost, like a new linked column (linked-properties §3.1).
Its type is copied from the source — for a linked column, from its read property — as the rename
copies a type. The report line says what happened: `copied project → status to project_status: 35
notes, 12 overwritten, 2 skipped (locked)`.

---

## 5. Open questions

1. **Which columns can be copied?** Every front matter column and every linked column, surely. Core
   columns: `title` into front matter is useful; `filename`, `size` and `lastModified` perhaps;
   `internalId` (the file link) never.
2. **Which notes?** Every note in the folder, whatever is filtered, as the delete does — or only the
   filtered ones, which would make "copy for these notes only" possible. Every note is simpler and
   harder to get wrong.
3. **An empty source value.** Remove the target key (so the target mirrors the source exactly), leave
   the target as it is, or write a bare `key:`? Removing matches clearing a cell and suits a re-copy.
4. **A linked list's empty slots** (`active, , done`). Kept as `""` items, so position still matches
   the links, or dropped, since a note's list has no reason to line up with anything?
5. **Can the target be the source?** Copying `status` onto `status` does nothing. Copying a linked
   column onto its own `via` property would replace the links with values, which is almost certainly
   a mistake, and onto its own `read` property never settles (§3.4.5). Refuse all three — or, for
   `read`, warn instead of refusing if a real use for it turns up.
6. **Remembering a copy.** Re-copying means choosing the same target again each time. Should a copy be
   remembered, so the linked column's menu offers "copy again to project_status"? That is a stored
   recipe in the layouts file, and could be a later step.
7. **Undo naming**: `describeBatch()` needs the `copy-property` kind, e.g. `project → status column
   copy to project_status in 35 files`.

---

## 6. Rejected

- **Copy → delete → rename**: §3.1.
- **Writing a linked value on every render**, to keep it in sync automatically. A render must never
  write a note, and it would write the whole folder on every redraw.

---

## 7. Verification (sketch)

- **Level 1**: exact bytes for a new key, an overwrite and a clear; the journal is on disk before the
  first write; notes already holding the value are not written; locked notes are skipped; one undo
  restores every byte; a note edited between the passes is refused; **a re-copy of a linked column
  whose values have not changed writes no note** (§3.4.2).
- **Node**: the raw text each kind of source produces (§3.3), and that a linked value formatted
  twice gives the same text (§3.4.2).
- **Level 2**: the dialog's two lines, the overwrite confirmation, and the new column appearing.
