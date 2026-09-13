# Plan: undoing a cell edit

Status: **not built**, and deliberately last. The mechanics below are settled; **the interface is
not** — §10 holds five open questions, and step 11a cannot be finished without them.
**Ctrl+Z is in scope from the start**, not a later addition: it is how people reach for undo, and
taking it seriously changed both the write's signature (§6.2) and two of §10's answers.
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

**They are now stated there too**, as `table-cell-writing.md` §4.6, so that plan can be built from
end to end without reading this one. What follows is the same three with the reasoning that belongs
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

These are the mechanics. The interface is a separate list and is **not** decided — §10.

| question | decision |
|---|---|
| Undoing anything other than a write | **No.** §1. |
| Persisting the stack across a reload | **No.** In memory, in `appState`. A stack that outlives the session is mostly stale entries, and §3 would drop them one by one — the honest version is not to offer it. |
| Depth | **20 batches.** Free (§2), so chosen for feel. |
| Clearing it | **On folder change only.** The ids mean nothing against a different folder. Not on view change: §3 makes that unnecessary. |
| Ctrl+Z | **Yes, and it is the primary entry point** — not a later addition. It is how people reach for undo, so a design that only works from a button is a design that has not been tested against the real gesture. §10.4 holds the guard it needs; §6.2 holds the one place it changed the shape of the write. |
| Re-sorting after an undo | **No**, for the same reason `table-cell-writing.md` gives for an edit: the row leaps away from under you. The same `applyRefresh` argument. |
| A history snapshot before the first edit | **Not in the shipped app.** Worth switching on while steps 2 to 5 are being built — it is a one-line call to `saveBackupEntry` and gives whole-file recovery through the existing history modal — then removed. As a scaffold against test folders the cap objection does not bite. |

---

## 10. Still to decide: the interface

Everything above is about bytes. **None of the five questions below is settled**, and step 11a cannot
be finished without answering them. Recorded here with the constraints each one runs into, and a
leaning where there is one.

Two of them — the confirmation and redo — are really one question asked twice: *what makes an
accidental undo recoverable?* They are answered together in §10.3 and §10.5, and both answers moved
once Ctrl+Z stopped being a later addition.

### 10.1 Where the control lives

**Leaning: the table's own control row.** `renderTableControls()` in `ui-functions-table/` already
draws it — the layout name, the column picker, the layouts edit, the save — and it is the row that
says what the table is showing and then offers to change it. An undo button belongs in that sentence.

The alternative worth weighing is a transient offer beside the cell just edited, which reads better
for the typo-noticed-immediately case. But it is not the cheaper option it looks: the refresh
re-renders the whole table, so anything attached to a cell has to survive that, which means it lives
in `appState` — which is the stack. Same state, different surface.

### 10.2 How the app says an undo happened

**The open one. There is no existing answer to copy**: the app has no toast or notification module,
and the nearest thing is `save-spin.js`, where the save button carries three glyphs and CSS shows one
according to a class.

Two facts make this harder than it sounds:

- **A single-cell undo just changes the cell.** The re-render is silent, and a value going back to
  what it was is exactly what a cell that was never edited looks like.
- **A batch undo may visibly change nothing at all.** Restore forty-eight values across twelve files
  and the rows may be on other pages, or filtered out. "Nothing happened" and "everything happened"
  look identical.

Options to weigh: a count reported in the control row; a transient highlight on the affected cells
that are on the current page; or nothing for a single cell and a report for a batch. The list-item
custom highlight in `ui-functions-highlight/` is the closest precedent for marking cells without
touching their markup.

**The refusal is not optional**, whatever is decided for success. §3's stale-entry case is the one
path where someone asked for something and nothing happened, and it has to say why — naming the
property and the file, since "it changed since" is only useful if you know where to look.

### 10.3 Whether a warning modal is needed

`showWarningModal(mainText, proceedText, cancelText)` already exists, reused across three flows and
returning a promise, so whatever is decided costs no new dialog.

**Leaning: on a batch, yes. On a single cell, no** — and this is a reversal of the position taken
before Ctrl+Z was a first-class entry point, which is worth saying out loud because the reversal is
the evidence that taking it seriously was the right call.

The earlier argument was that the modal earns its place as a **preview** rather than a speed bump:
*48 values in 12 files, 2 skipped because they changed since* is information no other surface can
give, worth reading every time, so show it always. **That argument survives for a batch and collapses
for one cell**, where the preview says "1 value in 1 file" and is worth nothing.

**Ctrl+Z is a reflex, and a modal on every press fights the gesture.** The key exists to be instant;
making it a two-step interaction is a design that works from a button and has not been tested against
the real thing. The commonest case — the typo noticed immediately — is the one the friction lands on
hardest.

So the threshold is right after all: **confirm when the batch holds more than one edit.** One
condition, `edits.length > 1`, not the intricate edge-case handling that objection had in mind — and
it falls on a real line rather than an arbitrary number, between the reflexive case and the
consequential one.

**What protects the single-cell press is redo, not a modal** — §10.5. Press Ctrl+Z by accident,
press Ctrl+Shift+Z. That is the native answer, and it is better than a dialog because it also
covers the press you meant at the time and regretted afterwards, which no confirmation can.

**One consequence carried over:** naming a skip count in the modal means knowing the §3 result before
it opens. §6.2 puts the check inside the write, so the cheap version is to confirm with counts only
and report skips afterwards. Previewing the skips as well means a read before the modal and a second
inside the write — the double read that §6.2 exists to avoid.

### 10.4 Whether undo is reachable only from the table view

**Leaning: yes.** The stack records edits made in the table, the affordance belongs where those edits
happen, and in any other view there is nothing for the result to be seen against.

**But it is a guard, not an absence**, and that is the thing to be clear about before any of this is
built. A button is scoped by not being drawn; a key binding is not scoped by anything. Since Ctrl+Z
is the binding anyone would reach for, plan for the key and let the button inherit the rule, rather
than the other way round.

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

**So Ctrl+Z is not free the way the button is** — but three conditions, two of which exist already,
is a small price for the gesture people actually use, and §9 treats it as the primary entry point
rather than a later addition.

Two details that only show up once it is real:

**Key repeat.** Hold Ctrl+Z and auto-repeat pops several batches before you let go. The §10.3
confirmation absorbs it for a batch; for the single-cell case, redo (§10.5) is what makes it
recoverable rather than alarming.

**Where focus goes after a commit.** This is the moment undo is most wanted — the typo noticed
instantly — and it works today only by accident: the refresh re-renders the whole table, the cell
element is destroyed, nothing restores focus, so `body` has it and `isTypingTarget()` is false. It
stays working if focus is later restored to the edited cell, because a re-rendered cell is not an
open editor. What would break it is reopening the editor after a commit, which nothing wants. **So
the guard has to ask whether the cell is an open editor, not whether it is the cell just edited** —
the same distinction `cell-editor.js` already draws.

### 10.5 Whether redo comes with it

**Leaning: yes — and this reverses an earlier "no", on both of the grounds it was refused.**

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

It was also refused because nobody asked for it. But once Ctrl+Z is the primary gesture,
Ctrl+Shift+Z is asked for by muscle memory — **undo without redo is half a gesture**, and the half
that is missing is the one that makes the first half safe to press.

That is what lets §10.3 drop the confirmation for a single cell. The two questions are really one:
*what makes an accidental undo recoverable?* A modal answers "stop the press you did not mean"; redo
answers "recover from any press, including the one you meant at the time". The second is stronger,
cheaper here than it looks, and the one people already know.

**What it does not change:** redo entries go stale exactly like undo entries, and the §3 check catches
them identically — edit a cell in the note modal after undoing, and the redo is refused with the same
sentence. Nothing new to write.

---

## 11. Steps

Undo is **step 6 of `table-cell-writing.md`**, after lists. Building it earlier means writing it
against an imagined interface, and rewriting it twice: step 4 adds §7's created key, step 5 adds the
item-level splice of §4.

### Step 11a — the stack and one entry deep

`appState.undoStack`, the record from §6.3 pushed onto it, `applyRawEdits` exported with its `expect`
argument, and the §3 check inside it. A button and Ctrl+Z, both reaching the same handler — **the key
is part of this step, not a follow-up**, because it is the gesture the design has to survive.

**§10 has to be answered before this can be finished.** The stack, the check and the write are
buildable and testable without it — but where the button goes, what the app says afterwards, and
whether a confirmation stands in front of it are all open, and the last of those changes whether the
files are read once or twice (§10.3).

**Checkable by:** edit a cell, undo it with the key, watch the file on disk go back. Then edit the
cell, change the same property in the note modal, undo, and watch it refuse. Then press Ctrl+Z with
a note open, with a cell editor open, and in grid view, and watch nothing happen in all three.

### Step 11b — depth, and the batch

Twenty batches, the button reporting what it will undo. Nothing new to build once 11a is in: a batch
of fifty and a batch of one take the same path.

**Arrives with paste**, and is the reason the seams are in step 2.

---

## 12. Where the code goes

| file | new? | why |
|------|------|-----|
| `public/js/editing/undo-cell-edits.js` | **new** | the check of §3 and the call back into `applyRawEdits` |
| `public/js/ui/ui-functions-click/undo-cell-edit.js` | **new** | one file per user action — undo and redo are one action with a direction, not two files |
| `public/js/services/store.js` | edit | `appState.undoStack` and `appState.redoStack` |
| `public/js/editing/save-cell-edit.js` | edit | export `applyRawEdits`; §6.2 built the split already |
| `public/js/ui/event-listeners-add.js` | edit | register the action |
| `public/js/ui/ui-functions-click/keyboard-shortcuts.js` | edit | Ctrl+Z and Ctrl+Shift+Z with the three-condition guard, and exporting `isTypingTarget()` — §10.4 |
| `public/js/ui/ui-functions-table/render-table-controls.js` | edit | the button, if §10.1 lands where it leans |
| ~~a confirmation dialog~~ | **exists** | `showWarningModal()` is already reused across three flows and returns a promise — §10.3 needs no new dialog, only the text |

**`undo-cell-edits.js` is separate from `save-cell-edit.js`** because it is the only module that knows
an edit can be stale. Everything about writing bytes stays in one place, as §6.2 arranges it.

**Nothing here covers §10.2**, because there is nothing to reuse: the app has no toast or
notification module, and what undo needs to say is the one part of this plan with no precedent in
the codebase to point at.
