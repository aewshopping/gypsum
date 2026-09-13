# Plan: undoing a cell edit

Status: **not built**, and deliberately last.
Branch: `claude/table-undo-stack-design-ica8um`
Manifest version now: `1.202.0` → bump the minor version with each step that changes code.
Depends on: `plans/table-cell-writing.md`, **not built** — steps 1 to 5 of it come first, and §6
below is the part of this plan that has to land inside that one.

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

---

## 6. What `table-cell-writing.md` has to do first

**This is the part that cannot wait**, and the only reason to have written this plan before that one
is built. Three seams, all of them in its step 2, none of them undo code. Two of the three are
forced by paste anyway.

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
| `applyRawEdits(rawEdits)` in `save-cell-edit.js` | spans, splicing, writing | both of those, **and undo** |

`applyCellEdits` is then thin: convert through `toYamlText`, hand the results to `applyRawEdits`.

**Undo calls the lower layer, and must.** Its text came *out of* the file, so it is already valid
front matter. Sending it back through `toYamlText` would not be faithful — `table-cell-writing.md`
§5.1 shows `[1, 2, 10]` captures as `["1", "2", "10"]`, so a re-converting undo restores a file
subtly unlike the one you had.

**In step 2 `applyRawEdits` is local, not exported.** The split is there because converting and
splicing are different jobs, not for a future caller; exporting it is a one-word change when step 6
arrives. Step 2 carries no speculative surface.

### 6.3 The write returns what it did

The record of §4, per edit that changed something — which the §4.5 no-change test has already
filtered. **Step 2 contains no undo code**: it returns the array and `cell-edit-commit.js` ignores
it. This plan is the first thing that looks at it.

Without these three, undo means a second module that knows how to splice front matter — the drift
hazard `table-cell-writing.md` §4.2 puts the spans inside the parser to avoid.

---

## 7. Undoing a key that did not exist

Step 4 of `table-cell-writing.md` writes a key the file never had, and may write the whole block. So
`existed: false`, and **undo removes the line rather than writing an empty value.**

This is a deliberate exception to that plan's "clearing a cell writes an empty value, never deletes
the key", and the exception is right: that rule exists so a column does not vanish as a side effect
of clearing one cell, whereas here the column only appeared *because* of the edit being undone.
Undoing a pasted column and leaving two hundred empty keys behind is the outcome to avoid.

**If removing the line leaves the block empty, remove the block.** Checked at undo time rather than
recorded, so there is no "did I create this block" flag to keep true.

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

---

## 9. Decisions taken

| question | decision |
|---|---|
| Redo | **No.** It doubles the state machine and the staleness surface of §3, which has to know which direction you last went. Nobody has asked for it. |
| Undoing anything other than a write | **No.** §1. |
| Persisting the stack across a reload | **No.** In memory, in `appState`. A stack that outlives the session is mostly stale entries, and §3 would drop them one by one — the honest version is not to offer it. |
| Depth | **20 batches.** Free (§2), so chosen for feel. |
| Clearing it | **On folder change only.** The ids mean nothing against a different folder. Not on view change: §3 makes that unnecessary. |
| Ctrl+Z | **Not at first.** The note modal has native undo in a `contenteditable` and a global handler fights it. A button first; a key scoped to the table view with no cell open, later. |
| Re-sorting after an undo | **No**, for the same reason `table-cell-writing.md` gives for an edit: the row leaps away from under you. The same `applyRefresh` argument. |
| A history snapshot before the first edit | **Not in the shipped app.** Worth switching on while steps 2 to 5 are being built — it is a one-line call to `saveBackupEntry` and gives whole-file recovery through the existing history modal — then removed. As a scaffold against test folders the cap objection does not bite. |

---

## 10. Steps

Undo is **step 6 of `table-cell-writing.md`**, after lists. Building it earlier means writing it
against an imagined interface, and rewriting it twice: step 4 adds §7's created key, step 5 adds the
item-level splice of §4.

### Step 6a — the stack and one entry deep

`appState.undoStack`, the record from §6.3 pushed onto it, `applyRawEdits` exported, and the §3 check.
A button that undoes the most recent batch.

**Checkable by:** edit a cell, undo it, watch the file on disk go back. Then edit the cell, change the
same property in the note modal, undo, and watch it refuse.

### Step 6b — depth, and the batch

Twenty batches, the button reporting what it will undo. Nothing new to build once 6a is in: a batch of
fifty and a batch of one take the same path.

**Arrives with paste**, and is the reason the seams are in step 2.

---

## 11. Where the code goes

| file | new? | why |
|------|------|-----|
| `public/js/editing/undo-cell-edits.js` | **new** | the check of §3 and the call back into `applyRawEdits` |
| `public/js/ui/ui-functions-click/undo-cell-edit.js` | **new** | one file per user action |
| `public/js/services/store.js` | edit | `appState.undoStack` |
| `public/js/editing/save-cell-edit.js` | edit | export `applyRawEdits`; §6.2 built the split already |
| `public/js/ui/event-listeners-add.js` | edit | register the action |

**`undo-cell-edits.js` is separate from `save-cell-edit.js`** because it is the only module that knows
an edit can be stale. Everything about writing bytes stays in one place, as §6.2 arranges it.
