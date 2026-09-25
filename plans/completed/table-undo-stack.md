# Plan: undoing a cell edit

> **Two rows of this plan are superseded by `plans/completed/table-delete-column.md`:** the stack is saved
> to `.gypsum/undo.gypsum` rather than kept in memory (§9 here, §8 there), and it holds 100 batches
> rather than 20 (§9 there). That plan also adds named entries, the undo list, and Ctrl+Z scoped to
> one visit to the table.

Status: **built.** Step 11a landed the stacks, the check, both buttons, all three key bindings, the
cell mark and the report line together — the interface of §10 as decided. **Step 11b was built by
`plans/completed/table-delete-column.md`** rather than waiting for paste: a column delete is a batch
across hundreds of notes, it needed the depth (100, not 20), and it needed a removed key to come
back where it was. Undoing a created key now takes the key out (§7, §13.1). Paste itself is its own
plan, `plans/table-range-paste.md`, and needs nothing more from this one.
Covered by `tests/1-data/52-table-undo-stack.spec.js`.
**Ctrl+Z was in scope from the start**, not a later addition — and so were both redo bindings,
`Ctrl/Cmd+Shift+Z` and `Ctrl+Y` (§10.5). Taking the keys seriously changed both the write's signature
(§6.2) and two of §10's answers.
Branch: `claude/vibrant-bohr-6a05pm`
Manifest version at 11a: `1.226.0` → bump the minor version with each step that changes code.
Depends on: `plans/completed/table-cell-writing.md`, **built** — its steps 1 to 5 all landed, §6
below among them, so `applyRawEdits` already takes a list, carries `expect` and returns the records
of §4. See that plan's §11 for the two places its shape grew while being built.

Someone edited a cell, or pasted a range over fifty of them, and wants it back the way it was.

---

## 1. What undo means here, and what it is not

**Undo reverses writes to disk made from the table, and nothing else.**

Not a view change, not a filter, not a sort. One keystroke that sometimes clears a filter and
sometimes rewrites a file is a trap: you press it expecting your typo back, and something else
happens. Undo has to mean exactly one category of thing to be trusted, and the category worth
having is the one that touched a file.

**It is also not a revert.** Restoring a whole file to its earlier text would undo one cell edit
*and* every other change made since — body text from the note modal, other properties, another
cell. Undo must be as narrow as the thing it undoes. This is the trap at the bottom of every
design that tries to build undo out of whole-file snapshots, and §8 says why that includes
`history.gypsum`.

---

## 2. Why this is cheap: the data is already in hand

To reverse a write you need what changed, what it was before, and a way to put it back. **The
edit path holds all three at the moment it splices.** It has just read the file, located the key
through `parseYaml`'s `spans` Map, and worked out the replacement text. So:

```
before = text.slice(span.valueStart, span.valueEnd)     // before the splice
after  = the same slice, once spliced
```

Two string slices. No second read, no diff, no parse. Putting it back is the same splice with the
two swapped, through the same verified write.

Which means **the stack itself is an array push, and costs nothing.** The real costs are the undo
write path and the affordance that triggers it, and those cost the same whether the stack holds one
entry or fifty. Depth is therefore a question about people, not about performance — and §5 settles
it.

---

## 3. The rule that makes it safe: verify at undo time

An entry saying `note.md:status was "draft"` is a promise about a file that may have moved on. You
edited it in the note modal; or in vim; or a sync client did.

> **On undo, check the file still says what this entry left there.** Read the file, find the key's
> span, compare its text with the entry's `after`. Equal: splice `before` back. Not equal: write
> nothing, drop the entry, say so.

**Compare against `after`, not `before`.** `after` is "the value I left there". If it is still
there, nothing has touched this property since, so restoring `before` reverses exactly this edit
and nothing else. If it is not, someone else has been here and `before` is a stale answer.

**Read the file rather than ask `appState`.** Saving from the note modal runs `refreshFileAfterSave`,
so `appState` would be right in that case and wrong for a note edited outside the app. The undo path
has to read the file to splice it anyway, so the check costs nothing.

**Worked through**, because it is the whole point of the rule:

| | |
|---|---|
| `note.md` holds | `status: draft` |
| edit the cell → the file holds | `status: published`, entry records `draft` → `published` |
| open the note, hand-type → the file holds | `status: archived`, entry is now stale |
| click undo, file says | `archived` |
| entry's `after` says | `published` |
| equal? | **no** — write nothing, drop the entry, say why |

Without the check, undo writes `draft` and the hand-typed `archived` is gone. The bad part is that
**it looks like it worked**: the table redraws showing `draft`, which is what undo was expected to
do. That is a loss nobody notices.

This also frees the stack from having to be short-lived. A guess at staleness — clearing the stack
when the view changes, or when a note is opened — is a worse version of a fact about it. Lifetime
becomes a choice about what feels right rather than a guard.

---

## 4. The entry

One record per edit that actually changed a file:

```js
{
  internalId,   // the file
  property,
  before,       // the key's whole value span, before the splice
  after,        // the same span, after
  existed,      // was the key in the file at all
}
```

**`internalId`, not `filepath`.** `rename-file.js` exists, and a rename between edit and undo must
not orphan the entry. `internalId` is the id that survives it.

**`before` and `after` are the *whole key's* value span**, even when the write spliced one item of a
list. The write stays as narrow as `table-cell-writing.md` §5 makes it, so a comment sitting between
two items survives; the *record* stays one shape regardless, so undo has one case rather than four.
`after` needs no re-parse to compute: the item splice happens inside the key span, so it is `before`
with the same replacement applied at the same offset.

**Both are sliced from the file text, never from the cell.** `table-cell-writing.md` §5.1 is the
reason: rendering a value and capturing it back is not a round trip, so the cell holds a rendering
and the file holds the bytes. Undo deals in bytes.

**`existed` is recorded but not acted on in v1** — §7. It is kept because the version that removes a
key needs it and cannot recover it afterwards: once the key is there, nothing in the file says who
put it there.

---

## 5. The unit is the batch, not the cell

An entry is one **batch**:

```js
{ timestamp, edits: [ /* the records above */ ] }
```

A single cell edit is a batch of one. Ctrl+Z after a paste undoes the paste; after typing in a cell,
undoes the cell. Both are what anyone expects, and both fall out of the same code.

This is forced by the paste feature rather than chosen for undo's sake. A pasted range that updates
fifty rows has to become one write per file — fifty verified write cycles and fifty refreshes would
be unusable — so the write path is batch-shaped whatever happens here. Undo just uses the shape that
is already there.

**Check each edit in a batch separately** (§3). Paste fifty cells, hand-edit two of them, and undo
should restore the forty-eight it can still safely reverse, skip the two, and say two were skipped.
Refusing the whole batch is unhelpful; bulldozing the two is the data loss of §3.

**What it says, and where** — §10.6: `undo (48 cells | 2 fail)`, on one line under the control row.
**What then goes on the redo stack: the forty-eight only.** The two were never reversed, so there is
nothing about them to redo — and an entry holding all fifty would send a *new* write at the
hand-typed value that caused the skip, which is §3's data loss arriving by the back door. No
filtering to write either way: `applyRawEdits` already returns one record per edit that changed
something, so the redo entry is its return value.

---

## 6. What `table-cell-writing.md` has to do first

**This is the part that cannot wait**, and the only reason to have written this plan before that one
is built. Four seams, all of them in its step 2, none of them undo code. Two of the four are forced
by paste anyway, and the fourth — the `expect` argument of §6.2 — is forced by the key bindings.

**They are now stated there too**, as `table-cell-writing.md` §4.6, so that plan can be built from
end to end without reading this one. What follows is the same four with the reasoning that belongs
on this side of the pair.

### 6.1 The commit takes a list

```js
// public/js/editing/save-cell-edit.js
/**
 * @param {Array<{internalId: string, property: string, text: string}>} edits
 * @returns {Promise<Array<object>>} one record per edit that changed the file
 */
export async function applyCellEdits(edits)
```

Group by file; per file read the text fresh, parse once with `spans`, apply that file's edits, call
`saveFileCopy` once. Step 2's caller passes an array of one.

**Apply a file's edits back to front, by `valueStart`.** Splice the first key and every later span
is off by the length delta. Working backwards keeps every span valid with no recomputation. It is
the standard bug in batch splicing and free to avoid once written down.

### 6.2 Two layers: what the typing means, and where the bytes go

| layer | knows about | called by |
|---|---|---|
| `toYamlText(text, type, form)` in `yaml-value-write.js` | types, the quoting rule | a cell edit, a paste |
| `applyRawEdits(rawEdits)` in `save-cell-edit.js` | spans, splicing, writing, **the §3 check** | both of those, **and undo and redo** |

`applyCellEdits` is then thin: convert through `toYamlText`, hand the results to `applyRawEdits`.

**Undo calls the lower layer, and must.** Its text came *out of* the file, so it is already valid
front matter. Sending it back through `toYamlText` would not be faithful — `table-cell-writing.md`
§5.1 shows `[1, 2, 10]` captures as `["1", "2", "10"]`, so a re-converting undo restores a file
subtly unlike the one you had.

**In step 2 `applyRawEdits` is local, not exported.** The split is there because converting and
splicing are different jobs, not for a future caller; exporting it is a one-word change when step 11
arrives. Step 2 carries no speculative surface.

#### The check belongs inside it, and that is Ctrl+Z's doing

An edit carries an optional `expect`:

```js
applyRawEdits([{ internalId, property, raw, expect }])
```

`raw` is the text to write. **`expect`, when given, is what the key's value span must currently say
for the edit to happen** — §3's rule, stated as data. A fresh edit omits it; an undo passes the
entry's `after`; a redo passes its `before`. The return of §6.3 gains a per-edit *applied or skipped*
so the caller can report what §5 requires.

**Written as a first-class entry point rather than a later addition, Ctrl+Z is what forces this.**
The check needs the file's current bytes; so does the splice. Leave the check outside and the file is
read twice, with a window between them — small, but the window is exactly the case the check exists
to catch, so a check that opens one is answering its own question wrong. Inside, it happens during
the read the write already does, and every caller gets it: undo, redo, and the paste, whose edits are
the same shape.

It also collapses three code paths into one. Commit, undo and redo differ only in what they put in
`raw` and `expect` — the reading, splicing, verifying, writing and refreshing are one function with
one set of bugs.

### 6.3 The write returns what it did

The record of §4, per edit that changed something — which the §4.5 no-change test has already
filtered. **Step 2 contains no undo code**: it returns the array and `cell-edit-commit.js` ignores
it. This plan is the first thing that looks at it.

Without these three, undo means a second module that knows how to splice front matter — the drift
hazard `table-cell-writing.md` §4.2 puts the spans inside the parser to avoid.

---

## 7. Undoing a key that did not exist — v1 puts the value back, not the key

> **Superseded.** Clearing a cell now takes the key out (CLAUDE.md, *Writing a cell edit back to the
> note*), so undoing a created key does the same: `before` is `''` with `existed: false`, which
> `applyRawEdits` reads as a removal. A bare key that did exist comes back bare (`keepKey`), and a
> removed key comes back at its `anchor`. See `plans/completed/table-delete-column.md` §5.2 and §12,
> and the test "undoing a created key removes it, and redoing puts it back". What follows is v1's
> reasoning.

Step 4 of `table-cell-writing.md` writes a key the file never had, and may write the whole block. The
obvious reading is that undo should take the line out again, and an earlier draft of this section said
so. **It does not, in v1: undo writes an empty value and leaves the key where it is.**

That is the *same* answer `table-cell-writing.md` gives for clearing a cell by hand — "write an empty
value; do not delete the key" — so undo needs no exception, no second splice shape and no new
argument on the write. **Which is the point.** Removing a key means teaching `applyRawEdits` to delete
a line, then to notice that the block is now empty, then to take the block and its blank line out
too — a third splice shape and two questions the parser does not currently answer. That is a yaml
layer rewrite in service of the smallest case this plan has, and v1 does not need it.

**So undo is not a total inverse, and the plan should be read that way.** Undo an edit that created
`status` and the note keeps a bare `status:`. The cell draws empty, which is what an undone cell
should look like; the column stays registered, which is a key that was not there before. The cost is
a dangling empty key, and the thing it buys is that every undo in v1 is the one splice shape the
write already performs.

**It also closes a hole rather than opening one.** A removal would have needed `expect` to tell "the
key is absent" from "the key is present and empty" — `applyRawEdits` computes `''` for both, so a
redo carrying `expect: ''` would have fired against a key someone had since added and left blank, and
appended a second copy of it. With no removal, a created key's `after` is always a real value (a
commit that changed nothing writes nothing, so an empty create cannot happen), and by the time its
redo runs the key is present and empty, which is what `''` means there. One value, one meaning.

**When this has to be revisited:** paste. Undoing a pasted column across two hundred rows would leave
two hundred empty keys, which is the outcome the earlier draft was written to avoid. So key removal
is a prerequisite of §11b and the paste plan, not of §11a — and `existed` is on the record from the
start so that version has what it needs.

---

## 8. Why not the line store

`history.gypsum` stays exactly as it is. Both ways of building undo on top of it are worse than they
look.

**Deriving undo from it** is not reuse. Snapshots are written when a note is *opened* and *closed*;
a cell edit writes none, by `table-cell-writing.md` §8. So it means adding snapshots to the edit path
and then diffing them to recover what the splice already knew one line earlier — read the whole file,
`JSON.parse`, rebuild content from `lineRefs`, diff, attribute the diff to a key, reverse-splice.
`saveBackupEntry` rewrites the entire history file per call, so a fifty-cell paste is fifty whole-file
rewrites; and `MAX_SNAPSHOTS_PER_FILE` is 15, so a burst of edits evicts the open/close history the
store is actually for.

**Rewriting it to be edit-aware** costs more than it looks. Its virtue is that **it does not know what
a property is** — it stores text, and text cannot become wrong. An edit record is a claim about
structure, falsified the moment a note is edited outside the app. Mixing two granularities in one array
makes `parseHistory`, `gcLines`, both caps, `readHistorySummary`, `readBackupHistory` and
`rename-backups.js` branch on kind: six files made conditional for one feature. And `parseHistory`
already carries one format migration; this would be a third format, permanently, in files that hold
live user data.

The two stores answer different questions. History: *what did this file contain at time T.* Undo:
*what did I just do.* Neither is cheaply derivable from the other, and a text editor having both an
undo buffer and a version history is not a contradiction. **The stack is a pending intention, not a
record.**

### 8.1 And the edit path writes no history either

The converse of the above, and the one that needs saying out loud because it is a rule to *keep*
rather than a thing to build: **a table write does not call `saveBackupEntry`, and must not start.**

Nothing in the write path touches history today — `save-cell-edit.js`, `save-file-copy.js`,
`save-current-file.js` and `file-save.js` have no reference to it between them. Snapshots are written
from exactly two places, `load-file-content.js` on opening a note and
`open-file-content-view-trans.js` on closing one. So there is nothing to remove; there is a line not
to add.

**The undo stack is what replaces it**, in a different form and a better one for this job: it reverses
the property that changed rather than restoring the file around it, which is §1's whole argument.

Two reasons to keep the write path clear of it, and they compound:

- **Clutter.** `MAX_SNAPSHOTS_PER_FILE` is 15. A dozen cell edits on one note would evict the
  open-and-close history that the store is actually for, so the feature that made history denser would
  be the feature that emptied it.
- **Speed, and this is the one that bites later.** `saveBackupEntry` rewrites the entire history file
  per call. A pasted range across fifty rows would be fifty whole-file rewrites of `history.gypsum`
  on top of the writes it actually came to do — sitting in the path of the operation with the least
  headroom in the app. `plans/table-range-paste.md` inherits a fast write path only if it is kept
  fast now.

Which is also why §9's scaffold row reads the way it does: a snapshot before the first edit was worth
switching on by hand while the write was being built, and is not something the shipped app does.

---

## 9. Decisions taken

These are the mechanics. The interface is §10, and is decided too. §13 is what is knowingly left out.

| question | decision |
|---|---|
| Undoing anything other than a write | **No.** §1. |
| Persisting the stack across a reload | **No.** In memory, in `appState`. A stack that outlives the session is mostly stale entries, and §3 would drop them one by one — the honest version is not to offer it. |
| Depth | **20 batches.** Free (§2), so chosen for feel. |
| Clearing it | **On folder change only.** The ids mean nothing against a different folder. Not on view change: §3 makes that unnecessary. |
| Ctrl+Z | **Yes, and it is the primary entry point** — not a later addition. It is how people reach for undo, so a design that only works from a button is a design that has not been tested against the real gesture. §10.4 holds the guard it needs; §6.2 holds the one place it changed the shape of the write. |
| The redo keys | **Both of them** — `Ctrl/Cmd+Shift+Z` and `Ctrl+Y`, because there is no single convention across platforms and supporting one strands the users of the other. `Ctrl+Y` takes Ctrl only: `Cmd+Y` is the browser's History on macOS. §10.5. |
| Re-sorting after an undo | **No**, for the same reason `table-cell-writing.md` gives for an edit: the row leaps away from under you. The same `applyRefresh` argument. |
| A history snapshot on a table write | **No — and there is nothing to remove.** No save path calls `saveBackupEntry`; only opening and closing a note does. The undo stack replaces it in a different form, and the write path stays clear of it for clutter and for speed. §8.1. |
| A snapshot as a build-time scaffold | **Done with.** It was worth switching on by hand while `table-cell-writing.md`'s steps 2 to 5 were being written; those landed, and the one-line call is not in the tree. Do not reinstate it for this plan's steps. |
| A confirmation before an undo | **No — not on one cell and not on a batch.** §10.3. |
| Where the buttons live | **The table's control row, pushed to its right end.** §10.1. |
| What an undo looks like | **The affected cells invert their colours briefly**, in CSS. §10.2. |
| Redo | **In this plan, not a follow-up.** §10.5, and step 11a builds it. |
| What an undo reports | **One short line under the control row** — `undo (3 cells | 1 fail)`. §10.6. |
| Undoing a key the edit created | **The value goes back to empty; the key stays.** §7. Not a total inverse, and deliberately so in v1. |
| What a partly-applied undo can redo | **Only the edits that were applied.** §5. |
| Renders per undo | **One**, however many files the batch touched. §10.2. |

---

## 10. The interface

Everything above is about bytes. **All of it is now answered.** Two things moved from where they were
settled while the confirmation was still in: §10.3 drops the modal entirely, which deletes the only
reason this plan had to read a file twice, and §10.6 — which did not exist while the modal was going
to do the reporting — is where an undo now says what it did. §13 is what v1 knowingly does not do.

### 10.1 Where the control lives — the table's control row

**Decided: `renderTableControls()`.** It already draws the row — the layout name, the column picker,
the layouts edit, the save — and it is the row that says what the table is showing and then offers to
change it. The alternative worth weighing was a transient offer beside the cell just edited, and it
is not the cheaper option it looks: the refresh re-renders the whole table, so anything attached to a
cell has to survive that, which means it lives in `appState` — which is the stack. Same state,
different surface.

**The row becomes full width, and undo and redo sit hard against its right end.** Layout name,
column picker, layouts edit, save; then the existing `.flexgrow` spacer from `utility.css`; then undo
and redo. The gap is the row's own, already 8px in `note-table.css`.

Pushed right rather than added to the end of the run, because **the four controls on the left are all
about the layout and these two are not.** Undo does not save, load or change the columns; sitting it
next to the save glyph would read as though it undid the save. A gap that says "different kind of
thing" costs nothing and is the only thing separating them.

`width: fit-content` in `table-layouts.css` goes, and the comment above it with it: that rule exists
to make the row "a faint plate holding the layout and what can be done to it", and a row with
something at each end is not that shape any more. It carries no background and `border: none`
already, so nothing else about the plate has to be unpicked.

**One thing was holding the row's shape up that nobody had noticed**: `.btn-menu` is `width: 100%`,
which is right in the side panel it was written for and invisible while the row was `fit-content`.
Full width, the layout name stretched the whole way across the table. `#layout-name` is sized to its
own text instead — which is what makes the gap to the right of it the spacer's rather than the
button's.

**Both buttons start disabled, and become live only when there is something to press.** Edit one
property and undo lights up; press it and undo goes dark and redo lights up. The condition is just
whether the matching stack has an entry, plus the in-flight flag of §10.4.

**The state is drawn from `appState` at render time and moved by hand in between**, which is exactly
the arrangement `markLayoutDirty()` / `markLayoutSaved()` already have a few lines below in the same
file, and for the same reason: **a cell edit re-renders the rows only**, never the control row, so a
button that waited for the next full render would go live at some unrelated moment and be dead at the
one moment it was wanted. A `markUndoState()` beside them, called after every push, pop and clear.

**The glyphs are the editor's own undo and redo.** They are moved out of the content modal's footer
into the shared sprite at the top of `index.html` as `#icon-undo` and `#icon-redo`, and both places
reach them with `<use>` — the modal's buttons and the table's. One drawing, two call sites, the
arrangement `#icon-save` and `#icon-close` already have. Two undo buttons in one app that were not
the same drawing is the outcome to avoid, and copying the markup into a second file is how that
happens six months later.

Their `data-tip` names the key, as the rest of the app does (`"close side panel | Alt+B"`):
`"undo last table edit | Ctrl+Z"` and `"redo | Ctrl+Shift+Z"`. Note that **a disabled button fires no
mouse events**, so neither tooltip shows while the button is dark — acceptable, and the same thing
already happens to the column picker's locked rows.

### 10.2 How the app says an undo happened — the cell inverts, briefly

**Decided: the cell's own colours, swapped, for a moment.** Background to `--colour-contr`, text to
`--colour-neutral-alt` — quick fade in, gentle fade out, driven by CSS. A class on the cell and a
keyframe animation; nothing in JS animates anything.

It answers the first of the two facts that made this hard: **a single-cell undo is otherwise a silent
re-render**, because a value going back to what it was looks exactly like a cell nobody touched. The
mark lands on the thing that changed, which is where the eye already is — no toast to look away to,
and no module to invent for one. The second fact, that a batch may change nothing visible at all, is
what §10.6 is for.

**The cell stays live while it plays.** No `pointer-events` change and nothing to wait for: press
undo and start typing in the same cell if you want to. The flash is information, not a state.

Three mechanics follow from that, and the first is not cosmetic:

- **The class goes on after the refresh, not before.** `applyRawEdits` calls the refresh, which
  replaces the rows — so a class put on the cell before the write is on an element that no longer
  exists by the time the animation would run. The cells are found again afterwards by address: the
  row's `data-vt-id` and the column's `data-prop`, which is how `keep-cell-state.js` already carries
  a cell across a render. **Which means the refresh has to be awaited**, and awaited once for the
  whole batch rather than once per file — the split that makes that possible is below.
- **A cell that is not on screen gets nothing.** Filtered out, on another page, or in a column that
  is hidden: there is nothing to invert, and inventing something would mean scrolling the table on
  the user's behalf. The line of §10.6 covers that case by counting rather than pointing — §13.3.
- **A cell whose undo was refused inverts too, but its text goes warning-coloured.** Same animation,
  same duration, one colour different — so the two outcomes are told apart by what the cell says
  rather than by whether it said anything. The colour is the same expression the info line uses,
  `color-mix(in srgb, var(--colour-contr-warning) 65%, currentColor 35%)`, which
  `note-table-cell.css` already uses for a mismatched cell's note and `load-error-nudge.css` for the
  load warnings. **Worth a screenshot rather than an argument**: `currentColor` inside an inverted
  cell is `--colour-neutral-alt`, so the mix lands somewhere the same expression has not been tried.
- **The class comes off on `animationend`**, so undoing the same cell twice plays it twice. A class
  that is already there restarts nothing.

Where an inverted cell reads oddly is the coloured row: a file's colour forces the row's text to
whatever reads against it, and the flash overrides both properties, so it lands on the theme's
contrast pair whatever colour the row is. That is the same choice `.note-table-cell.is-expanded`
already makes for the same reason.

#### One render per undo, not one per file

`applyRawEdits` called `refreshFileNow` **once per file**, and did not await it. Neither half survives
contact with this plan: the flash needs the render to have happened, and a batch across twelve files
would otherwise be twelve full re-renders of the table — twelve sorts, twelve filter passes, twelve
view transitions interrupting each other.

`save-cell-edit.js` already says so in a comment — "which a batch across several files will have to
change: it re-reads and re-renders per file, where a batch wants to re-read all of them and render
once" — and assigns it to paste. **It lands here instead**, because undoing a batch is the first
multi-file caller either plan has.

So `applyRefresh` splits along the seam its own comment names: **re-read a file into `appState`**, and
**render what is there**. `refreshFilesNow(snapshots)` calls the first for each file and the second
once, and is what both the deferred autosave path and the write now go through — `refreshFileNow`
is gone rather than kept as a one-line wrapper nothing calls. It is a real change to a function every
save goes through, which is the reason to do it deliberately and not as a side effect of the first
paste.

### 10.3 Whether a warning modal is needed — no, on neither

**Decided: no confirmation, on a single cell or on a batch.** This reverses the leaning this section
used to carry, which was "on a batch, yes".

- **A single-cell undo has to be instant.** Ctrl+Z is a reflex and a modal on every press fights the
  gesture; the commonest case, the typo noticed immediately, is the one the friction lands on
  hardest. That argument was already here and is unchanged.
- **A batch undo would be the second modal in a row.** A pasted range will have its own confirmation
  in front of it when `plans/table-range-paste.md` is built, so an undo modal behind it is death by a
  thousand warnings for one `Ctrl+V` and one `Ctrl+Z`.
- **Redo is the recovery** (§10.5). It covers the accidental press *and* the press you meant at the
  time and regretted afterwards, which no confirmation can.

**What this deletes**, beyond the dialog: the `edits.length > 1` threshold, and the double-read worry
this section used to end on. Nothing needs to know the §3 skip count before anything opens, so the
check stays inside the write where §6.2 puts it and each file is read exactly once. `showWarningModal`
is not used by this plan at all.

**The refusal still has to be said** (§3), and with the modal gone §10.6 is what says it.

### 10.4 Whether undo is reachable only from the table view — yes

**Decided: yes**, for the button and the key alike.

**But it is a guard, not an absence.** A button is scoped by not being drawn; a key binding is not
scoped by anything. Since Ctrl+Z is the binding anyone would reach for, plan for the key and let the
button inherit the rule, rather than the other way round.

**`showModal()` does not stop a key reaching the handler.** It makes everything outside the dialog
inert for the pointer and for focus, but keys pressed *inside* the dialog bubble to the document like
any other event, and `keyDownDelegate` is registered on the document. The codebase already proves it:
the number-key shortcut in `keyboard-shortcuts.js` has to test `document.querySelector('dialog[open]')`
by hand, which it would not need if an open dialog swallowed the event.

So the key means "undo a cell edit" only when all three hold:

| condition | already an idiom? |
|---|---|
| the table view is current | `appState.viewState` |
| no dialog is open | **yes** — `!document.querySelector('dialog[open]')`, as the number keys do |
| focus is not in something with its own undo | **yes** — `isTypingTarget()`, though it is local to `keyboard-shortcuts.js` and would need exporting |

The third is the one worth stating as a rule rather than a list: **if focus is in something that has
its own undo, the key is not ours.** That is one question about the focused element rather than an
enumeration of app states, and it covers the two places the same hazard appears — a note's
`contenteditable` in the modal, and an open cell editor in the table itself. Undoing a *file write*
when someone meant to undo the word they just typed is §1's trap with a disk write behind it.

Four details that only show up once it is real. The first two were here already; the last two are
what dropping the confirmation leaves uncovered.

**Key repeat: auto-repeat is ignored.** `if (evt.repeat) return`, first line of the handler. The
confirmation used to absorb a held Ctrl+Z; with no modal, holding it would pop the whole stack in
about a second, each entry a verified read-and-write cycle per file, and holding a redo key would
re-apply them just as fast. One press, one batch.

**One undo at a time.** Undo reads files and writes them, so a second press landing mid-flight would
check §3 against bytes the first press has not written yet — the exact race `expect` exists to close,
reopened from the other end. An in-flight flag, and both buttons disabled while it is set, which is
the same disabled state §10.1 already draws.

**Where focus goes after a commit.** This is the moment undo is most wanted — the typo noticed
instantly — and it works today only by accident: the refresh re-renders the whole table, the cell
element is destroyed, nothing restores focus, so `body` has it and `isTypingTarget()` is false. It
stays working if focus is later restored to the edited cell, because a re-rendered cell is not an
open editor. What would break it is reopening the editor after a commit, which nothing wants. **So
the guard has to ask whether the cell is an open editor, not whether it is the cell just edited** —
the same distinction `cell-editor.js` already draws.

**A cell editor keeping Ctrl+Z is the feature, not the cost.** The third condition hands the key back
to the browser while you are typing in a cell, which is the undo you want at that moment — the word
you just typed, not the file you saved a minute ago. Nothing here tries to be cleverer than that.
Pressing the *button* with a cell open is the one rough edge left, and it is left: see §13.2.

### 10.5 Whether redo comes with it — yes, and in this plan

**Decided: yes, built in step 11a rather than deferred.** This reverses an earlier "no", on both of
the grounds it was refused.

It was refused for doubling the state machine and the staleness surface, "which has to know which
direction you last went". That is wrong. **The record of §4 is symmetric, so the check is
direction-free:**

| | check | write |
|---|---|---|
| the edit | — | span goes `before` → `after` |
| undo it | span says `after` | write `before` |
| redo it | span says `before` | write `after` |

Undo and redo are the same record with the two fields swapped, through the same `expect`/`raw` pair
of §6.2. There is no second check and no direction to remember: pop from one stack, apply, push onto
the other. The cost is one more array in `appState` and the ordinary rule that **a new edit clears
the redo stack**.

**Built, it turned out to need no swap at all** — which is this argument one step further than it was
written. A record means "this span went `before` → `after`", and `applyRawEdits` returns a fresh
record for *every* write, oriented to the write it just did. So the undo's own record already reads
`after` → `before`, and reversing *that* is the redo. Both directions are the same two lines —
`raw: edit.before, expect: edit.after` — and the only thing the direction decides is which stack is
popped and which is pushed. The table above is still the truth about the bytes; it just describes one
record being read twice rather than two ways of reading it.

It was also refused because nobody asked for it. But once Ctrl+Z is the primary gesture, redo is
asked for by muscle memory — **undo without redo is half a gesture**, and the half that is missing is
the one that makes the first half safe to press. With the confirmation gone (§10.3) it is the *only*
thing that makes the first half safe to press, which is why it cannot be a follow-up.

#### Both redo bindings, because there is no single one

**Bind Ctrl+Y as well as Ctrl/Cmd+Shift+Z.** There is no one redo key: `Ctrl+Y` is the Windows
convention, `Cmd+Shift+Z` the macOS one, and `Ctrl+Shift+Z` is used on Windows too. Supporting one of
them means half the users press a key that does nothing, and it is the half that varies by whoever
happens to open the app. Two conditions in the same handler, so there is no reason to choose.

| gesture | modifier | note |
|---|---|---|
| undo | `Ctrl+Z` / `Cmd+Z` | the codebase already tests `evt.ctrlKey \|\| evt.metaKey` |
| redo | `Ctrl+Shift+Z` / `Cmd+Shift+Z` | `evt.key` is `'Z'` when shift is held — `keyboard-shortcuts.js` already relies on this for `Ctrl+Shift+S` |
| redo | `Ctrl+Y` | **Ctrl only, not Cmd**: `Cmd+Y` is the browser's own History shortcut on macOS, so taking it would break something the user has and replace it with something they would not look for there |

Everything §10.4 requires of Ctrl+Z is required of these identically — the same three conditions, the
same `preventDefault`, the same `evt.repeat` guard and the same in-flight flag, which matter slightly
more for redo since holding it re-applies writes rather than reverting them.

**What redo does not change:** redo entries go stale exactly like undo entries, and the §3 check
catches them identically — edit a cell in the note modal after undoing, and the redo is refused with
the same sentence. Nothing new to write.

### 10.6 What an undo says it did

**Decided: one short line in its own block under the control row.**

| | |
|---|---|
| everything applied | `undo (1 cells)` — or `undo (3 cells)` for a batch |
| some refused | `undo (3 cells | 1 fail)`, the whole line in the warning colour |
| redo | the same two shapes, reading `redo (…)` |

**It borrows the load message's voice**, which is the app's existing answer to "say what just happened
and then stop mattering": `--colour-load-msg` for the quiet state, and
`color-mix(in srgb, var(--colour-contr-warning) 65%, currentColor 35%)` for the warning, which is
`.load-error-nudge`'s exact colour. Nothing new is invented — the app still has no toast module and
still does not need one.

**Its own block below the control row**, not inside it. The row is a run of controls and this is a
sentence; putting it in the row would make the row's height jump when the sentence appears, and at
mobile width it would wrap the buttons rather than itself.

**Short enough to fit one line on a phone**, which is why it counts rather than points. It does not
say *which* cell failed, and on a filtered-out or off-page row the inverted cell says nothing either —
so a refusal that happens out of view is a number and no more. That is accepted: a refusal is rare, a
count is enough to know to go looking, and the alternative is a sentence naming a file and a property
that does not fit the line. **If it proves too thin, more goes in this line** — it is the surface to
grow, not a second one to add.

The line clears itself the way the load message settles: shown on an undo, gone a few seconds later.
An undo arriving while one is still up replaces it. It is `role="status"`, so an undo reached by the
key says what it did to a screen reader too — the cell mark is colour and nothing else.

**It keeps its height when it has nothing to say.** A block that appears and disappears moves the
whole table down and back up — twice per press, and a run of Ctrl+Z would have it hopping. So the
element is always in flow and simply emptied. Getting that to a true zero took one more
thing than it looks: the app is `box-sizing: border-box` everywhere, so a reserved `min-height`
swallowed the line's padding while it was empty and did not once it had text, and the table moved by
exactly that padding. This one element is `content-box`, which is what makes the two heights the same
number rather than two numbers that happen to be close.

---

## 11. Steps

Undo is **step 6 of `table-cell-writing.md`**, after lists — which have landed, so nothing is waiting
on that plan any more. Building it earlier would have meant writing it against an imagined interface
and rewriting it twice: step 4 added §7's created key, step 5 added the item-level splice of §4.

### Step 11a — the stacks, the keys, the buttons and the line

One step, because every part of it is load-bearing for another part: the flash needs the awaited
render, redo is what makes undo safe to press with no confirmation in front of it, and the disabled
buttons are what say the stacks are empty.

1. `appState.undoStack` and `appState.redoStack`, cleared on folder change.
2. `applyRefresh` split into re-read-a-file and render, and `refreshFilesNow(snapshots)` putting them
   back together, so a batch re-reads each file it touched and renders once — §10.2.
   `refreshFileAfterSave` keeps its signature and calls it; `refreshFileNow` is deleted rather than
   left as a one-line wrapper with no callers.
3. `applyRawEdits` exported, its `expect` argument honoured (it is already written and already
   checked — nothing passes it yet), and the refresh awaited so the caller knows when the rows exist.
4. `applyCellEdits` pushes one batch per call and clears the redo stack. **Not `applyRawEdits`** —
   undo calls that one, and a stack that pushed from there would push the undo.
5. `undo-cell-edits.js`: pop, call `applyRawEdits`, push **what came back** onto the other stack —
   which is the applied edits and only those, §5. No swap; see §10.5.
6. The keys — Ctrl+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y — behind §10.4's three conditions, the `evt.repeat`
   guard and the in-flight flag.
7. The glyphs moved into the sprite, the control row made full-width, the two buttons drawn from
   `appState` and moved by hand.
8. The flash: one class, one keyframe rule, applied after the render by address — and its
   warning-coloured variant for a cell that was refused.
9. The report line under the control row — §10.6.

**No key is ever removed** (§7), so there is no third splice shape to write and no new spelling of
`expect`. That is the single biggest thing keeping this step to one sitting.

**Checkable by:** edit a cell, undo it with the key, watch the file on disk go back and the cell
flash. Then edit the cell, change the same property in the note modal, undo, and watch it refuse —
the cell warning-coloured, the line reading `undo (0 cells | 1 fail)`. Redo it with each of
Ctrl+Shift+Z and Ctrl+Y, and watch both reach the same handler. Then press Ctrl+Z with a note open,
with a cell editor open, and in grid view, and watch nothing happen in all three — in the cell editor
because the browser took it, which is the point. Then watch the buttons: dark on a fresh folder, undo
live after one edit, undo dark and redo live after one press, both dark after a folder change.

**Screenshots, not expectations** — the disabled states, the flash, the warning mix inside an inverted
cell and the report line at mobile width are all things that look right in the code and wrong on
screen.

### Step 11b — depth, the batch, and the key that has to go

> **Built by `plans/completed/table-delete-column.md`**, not with paste: depth 100 (its §9), a batch
> of many notes through a pool (its §6), key removal and re-creation in place (its §5.2, §12).

Twenty batches, and a batch bigger than one. Most of it is nothing new once 11a is in: a batch of
fifty and a batch of one take the same path, the render is already one per batch, and the report line
already counts.

**What is new is §7.** Undoing a pasted column across two hundred rows leaves two hundred empty keys,
which is where "undo does not remove a key" stops being an acceptable v1 simplification. Key removal —
the line, the emptied block, and `expect` learning to mean "absent" — belongs here, with paste, where
there is a reason to pay for it.

**Arrives with paste**, and is the reason the seams are in step 2.

---

## 12. Where the code goes

| file | new? | why |
|------|------|-----|
| `public/js/editing/undo-cell-edits.js` | **new** | the two stacks, and the call back into `applyRawEdits` — §10.5 |
| `public/js/ui/ui-functions-click/undo-cell-edit.js` | **new** | one file per user action — undo and redo are one action with a direction, not two files |
| `public/css/table-undo-flash.css` | **new** | the inverted cell of §10.2 and its warning variant. Its own file: a new component gets one, and this is a mark no other rule shares |
| `public/js/ui/ui-functions-table/render-undo-report.js` | **new** | the line of §10.6 — what it says, and clearing it |
| `public/css/table-undo-report.css` | **new** | that line's quiet and warning states, borrowing `--colour-load-msg` and `.load-error-nudge`'s mix |
| `public/js/services/store.js` | edit | `appState.undoStack` and `appState.redoStack` |
| `public/js/editing/save-cell-edit.js` | edit | export `applyRawEdits`, honour `expect`, await the render, push the batch from `applyCellEdits` |
| `public/js/editing/refresh-file-state.js` | edit | split `applyRefresh` into re-read-a-file and render, add `refreshFilesNow`, drop `refreshFileNow` — §10.2 |
| `public/js/ui/ui-functions-cell/cell-edit-commit.js` | edit | light the buttons once a commit's batch has landed — a DOM question, so it belongs this side of the layer |
| `public/js/ui/ui-functions-click/load-files-click.js` | edit | clear both stacks in `postLoad`, which all three load paths run |
| `tests/1-data/52-table-undo-stack.spec.js` | **new** | the checks in §11a, plus the buttons, the report line and both marks |
| `public/js/ui/event-listeners-add.js` | edit | register `table-undo` and `table-redo` |
| `public/js/ui/ui-functions-click/keyboard-shortcuts.js` | edit | Ctrl+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y behind the three-condition guard, and exporting `isTypingTarget()` — §10.4, §10.5 |
| `public/js/ui/ui-functions-table/render-table-controls.js` | edit | the two buttons, the spacer, the report line, and `markUndoState()` beside `markLayoutDirty()` — §10.1 |
| `index.html` | edit | `#icon-undo` and `#icon-redo` into the shared sprite; the content modal's two buttons become `<use>` — §10.1 |
| `public/css/table-layouts.css` | edit | drop `width: fit-content` from `.table-controls`, size `#layout-name` to its text, and the disabled fade for the two buttons — §10.1 |
| `public/style.css` | edit | import the two new component files |
| `tests/50-render-transitions.spec.js` | edit | it drove `refreshFileNow` directly; now drives `refreshFilesNow` |
| ~~a confirmation dialog~~ | **not used** | §10.3 drops the modal on both paths, so `showWarningModal()` is not part of this plan |
| ~~a yaml removal path~~ | **not in v1** | §7 — undo writes an empty value, so no splice shape and no parser question is added |

**`undo-cell-edits.js` is separate from `save-cell-edit.js`** because it is the only module that knows
an edit can be stale. Everything about writing bytes stays in one place, as §6.2 arranges it.

**The two new CSS files are two components, not one.** The cell's mark and the row's sentence are in
different places, appear at different moments and are read for different things; the only thing they
share is a colour expression, and that already lives in `load-error-nudge.css` for a third caller to
copy.

---

## 13. What v1 knowingly does not do

Three accepted limitations. None of them is a question — they are recorded so that hitting one is
recognised rather than diagnosed.

### 13.1 Undo does not remove a key it created

> **No longer true** — see the note at the top of §7.

§7. Undoing an edit that created a property writes an empty value and leaves the key in the note, so
the column stays registered and the note keeps a bare `status:`. **Undo is not a total inverse.** The
cost is bounded at one dangling key per undone create, and it stops being bounded with paste — which
is where the fix belongs (§11b).

### 13.2 The button pressed with a cell open may undo the wrong batch

The *key* cannot reach the handler while a cell editor has focus, and that is deliberate (§10.4): the
browser's own undo is the right one while you are typing. **A click on the button can**, and it
commits the cell on the way in — `focusin` moves to the button, the open cell collapses, the commit
is written. That write is asynchronous, so the batch it creates may not be on the stack yet when the
click handler runs, and the press undoes the batch before it.

**Left alone deliberately.** Holding the commit's promise and awaiting it before popping would fix it,
and would put a piece of cross-module sequencing into a path whose whole virtue is that it has none.
The gesture that gets it right — press Escape or Enter, then press the button — is the one most people
make anyway, and Ctrl+Z after a commit has none of this problem because focus has left the cell by
then.

### 13.3 A refusal says how many, never which

§10.6. `undo (3 cells | 1 fail)` counts; it does not name the file or the property, and a refused cell
on a filtered-out or off-page row shows nothing on screen either. So a refusal that happens out of
view is a number and no more.

Accepted because a refusal is rare, a count is enough to know to go looking, and the line has to fit
one phone-width line. **If it proves too thin, the line is what grows** — a naming sentence goes in
there, not into a second surface.

---

## 14. What changed after it was built

§10 and §12 describe the report and the mark as they were first shipped. Three things moved after
the fact, so where those sections disagree with the code below, these are the ones that hold.

**The report line left the table.** It was `#table-undo-report`, rendered by `renderTableControls()`
and sitting under the control row; it is now `#output-report`, a permanent element in `index.html`
between the tag taxonomy and `#output`, owned by `ui-functions-render/output-report.js`. The reason
is that it gained a second thing to say which is not the table's: **every render, in every view,
writes the filtered file count into it** — `files filtered: 42`, from `renderFiles`, before the
early returns, since the two empty states are themselves answers to "how many".

So the line reads `files filtered: 42 | undo: 3 values, 1 fail`, and the two writers do not know
about each other — it is repainted from both halves held in that module, because a render is exactly
what an undo causes and whichever spoke last would otherwise erase the other. The undo half is a
`<span>`, and **the warning colour is that span's alone**: the count beside it did not fail and must
not look as though it had. §10.6's "the whole line in the warning colour" is superseded on that
point, and so is the wording — `undo (3 cells | 1 fail)` is now `undo: 3 values, 1 fail`.

It takes `#fileCountElement`'s voice exactly — same size, same interface font, same colour — rather
than the quiet grey it borrowed from `--colour-load-msg`, which was scoped to that element anyway
and never resolved here. The undo half now stays for **5 s** rather than 4.

**The mark on a cell is gentler and lasts longer.** 3 s rather than ~0.8, and a muted
`color-mix(in srgb, var(--colour-contr) 60%, var(--colour-neutral-alt))` rather than the full
inversion — the mix a pressed button already uses, with that button's text colour over it.

The shape of the animation changed with it: **no fade in at all**, a 2 s hold, then a 1 s fade out.
That is `animation: undo-flash var(--undo-flash-out) ease-out var(--undo-flash-hold) backwards` —
the hold is the animation's *delay*, and `backwards` gives the cell the first keyframe for the whole
of it. Both durations stay durations that way; written as keyframe percentages the three seconds
would be spread across a list and neither number would be legible.

`render-undo-report.js` is now `undo-cell-flash.js`, and is only the mark.
