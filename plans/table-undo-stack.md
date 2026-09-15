# Plan: undoing a cell edit

Status: **not built**, and deliberately last. The mechanics below are settled, and **the interface
now mostly is too** — §10 records the answers rather than the questions, and §13 holds the handful
that are left.
**Ctrl+Z is in scope from the start**, not a later addition — and so are both redo bindings,
`Ctrl/Cmd+Shift+Z` and `Ctrl+Y` (§10.5). Taking the keys seriously changed both the write's signature
(§6.2) and two of §10's answers.
Branch: `claude/vibrant-bohr-6a05pm`
Manifest version now: `1.225.0` → bump the minor version with each step that changes code.
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
Refusing the whole batch is unhelpful; bulldozing the two is the data loss of §3. **What it says, and
where** — §13.1. **What then goes on the redo stack** — §13.5.

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

## 7. Undoing a key that did not exist

Step 4 of `table-cell-writing.md` writes a key the file never had, and may write the whole block. So
`existed: false`, and **undo removes the line rather than writing an empty value.**

This is a deliberate exception to that plan's "clearing a cell writes an empty value, never deletes
the key", and the exception is right: that rule exists so a column does not vanish as a side effect
of clearing one cell, whereas here the column only appeared *because* of the edit being undone.
Undoing a pasted column and leaving two hundred empty keys behind is the outcome to avoid.

**If removing the line leaves the block empty, remove the block.** Checked at undo time rather than
recorded, so there is no "did I create this block" flag to keep true.

**How `applyRawEdits` is told to do either is open** — §13.4, which also has the hole this case opens
under `expect`: a created key's `before` is `''`, and `''` is what the write computes for a key that
is absent *and* for a key that is present and empty.

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

These are the mechanics. The interface is §10, and is now decided too, bar §13.

| question | decision |
|---|---|
| Undoing anything other than a write | **No.** §1. |
| Persisting the stack across a reload | **No.** In memory, in `appState`. A stack that outlives the session is mostly stale entries, and §3 would drop them one by one — the honest version is not to offer it. |
| Depth | **20 batches.** Free (§2), so chosen for feel. |
| Clearing it | **On folder change only.** The ids mean nothing against a different folder. Not on view change: §3 makes that unnecessary. |
| Ctrl+Z | **Yes, and it is the primary entry point** — not a later addition. It is how people reach for undo, so a design that only works from a button is a design that has not been tested against the real gesture. §10.4 holds the guard it needs; §6.2 holds the one place it changed the shape of the write. |
| The redo keys | **Both of them** — `Ctrl/Cmd+Shift+Z` and `Ctrl+Y`, because there is no single convention across platforms and supporting one strands the users of the other. `Ctrl+Y` takes Ctrl only: `Cmd+Y` is the browser's History on macOS. §10.5. |
| Re-sorting after an undo | **No**, for the same reason `table-cell-writing.md` gives for an edit: the row leaps away from under you. The same `applyRefresh` argument. |
| A history snapshot before the first edit | **Not in the shipped app.** Worth switching on while steps 2 to 5 are being built — it is a one-line call to `saveBackupEntry` and gives whole-file recovery through the existing history modal — then removed. As a scaffold against test folders the cap objection does not bite. |
| A confirmation before an undo | **No — not on one cell and not on a batch.** §10.3. |
| Where the buttons live | **The table's control row, pushed to its right end.** §10.1. |
| What an undo looks like | **The affected cells invert their colours briefly**, in CSS. §10.2. |
| Redo | **In this plan, not a follow-up.** §10.5, and step 11a builds it. |

---

## 10. The interface

Everything above is about bytes. **All five questions below are now answered**, and the answers move
two things that were settled the other way while the confirmation was still in: §10.3 drops the modal
entirely, which deletes the only reason this plan had to read a file twice. What is left open is
§13, and none of it is about where the controls go or what they say.

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
§13.1.

**The cell stays live while it plays.** No `pointer-events` change and nothing to wait for: press
undo and start typing in the same cell if you want to. The flash is information, not a state.

Three mechanics follow from that, and the first is not cosmetic:

- **The class goes on after the refresh, not before.** `applyRawEdits` calls `refreshFileNow`, which
  replaces the rows — so a class put on the cell before the write is on an element that no longer
  exists by the time the animation would run. The cells are found again afterwards by address: the
  row's `data-vt-id` and the column's `data-prop`, which is how `keep-cell-state.js` already carries
  a cell across a render. **Which means the refresh has to be awaited** — see §13.2, because a batch
  makes that more than a missing `await`.
- **A cell that is not on screen gets nothing.** Filtered out, on another page, or in a column that
  is hidden: there is nothing to invert, and inventing something would mean scrolling the table on
  the user's behalf. §13.1.
- **The class comes off on `animationend`**, so undoing the same cell twice plays it twice. A class
  that is already there restarts nothing.

Where an inverted cell reads oddly is the coloured row: a file's colour forces the row's text to
whatever reads against it, and the flash overrides both properties, so it lands on the theme's
contrast pair whatever colour the row is. That is the same choice `.note-table-cell.is-expanded`
already makes for the same reason.

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

The refusal still has to be said (§3), and that is now the whole of what §10.2 leaves open — §13.1.

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

**Pressing the button while a cell is open is its own case** — see §13.3. The key cannot reach the
handler with an editor focused, but a click on the button can, and it commits the cell on the way in.

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
---

## 11. Steps

Undo is **step 6 of `table-cell-writing.md`**, after lists — which have landed, so nothing is waiting
on that plan any more. Building it earlier would have meant writing it against an imagined interface
and rewriting it twice: step 4 added §7's created key, step 5 added the item-level splice of §4.

### Step 11a — the stacks, the keys and the buttons

One step, because every part of it is load-bearing for another part: the flash needs the awaited
refresh, redo is what makes undo safe to press, and the disabled buttons are what say the stacks are
empty.

1. `appState.undoStack` and `appState.redoStack`, cleared on folder change.
2. `applyRawEdits` exported, its `expect` argument honoured (it is already written and already
   checked — nothing passes it yet), and the two shapes §7 needs: a key removed, and the block
   removed with it. §13.4.
3. `applyCellEdits` pushes one batch per call and clears the redo stack. **Not `applyRawEdits`** —
   undo calls that one, and a stack that pushed from there would push the undo. §13.5.
4. `undo-cell-edits.js`: pop, swap `raw` and `expect`, call `applyRawEdits`, push what was applied
   onto the other stack.
5. The keys — Ctrl+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y — behind §10.4's three conditions, the `evt.repeat`
   guard and the in-flight flag.
6. The glyphs moved into the sprite, the control row made full-width, the two buttons drawn from
   `appState` and moved by hand.
7. The flash: one class, one keyframe rule in a CSS file of its own, applied after the refresh by
   address.

**Checkable by:** edit a cell, undo it with the key, watch the file on disk go back and the cell
flash. Then edit the cell, change the same property in the note modal, undo, and watch it refuse.
Redo it with each of Ctrl+Shift+Z and Ctrl+Y, and watch both reach the same handler. Then press
Ctrl+Z with a note open, with a cell editor open, and in grid view, and watch nothing happen in all
three. Then watch the buttons: dark on a fresh folder, undo live after one edit, undo dark and redo
live after one press, both dark after a folder change.

**Screenshots, not expectations** — the buttons' disabled states and the flash are exactly the kind
of thing that looks right in the code and wrong on screen.

### Step 11b — depth, and the batch

Twenty batches, and a batch bigger than one. Nothing new to build once 11a is in: a batch of fifty
and a batch of one take the same path, and §13.1 and §13.2 are the two places where that is not quite
true yet.

**Arrives with paste**, and is the reason the seams are in step 2.

---

## 12. Where the code goes

| file | new? | why |
|------|------|-----|
| `public/js/editing/undo-cell-edits.js` | **new** | the direction swap of §10.5 and the call back into `applyRawEdits` |
| `public/js/ui/ui-functions-click/undo-cell-edit.js` | **new** | one file per user action — undo and redo are one action with a direction, not two files |
| `public/css/table-undo-flash.css` | **new** | the inverted cell of §10.2. Its own file: a new component gets one, and this is a mark no other rule shares |
| `public/js/services/store.js` | edit | `appState.undoStack` and `appState.redoStack` |
| `public/js/editing/save-cell-edit.js` | edit | export `applyRawEdits`, honour `expect`, add §7's removal shapes, push the batch from `applyCellEdits` |
| `public/js/ui/event-listeners-add.js` | edit | register `table-undo` and `table-redo` |
| `public/js/ui/ui-functions-click/keyboard-shortcuts.js` | edit | Ctrl+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y behind the three-condition guard, and exporting `isTypingTarget()` — §10.4, §10.5 |
| `public/js/ui/ui-functions-table/render-table-controls.js` | edit | the two buttons, the spacer, and `markUndoState()` beside `markLayoutDirty()` — §10.1 |
| `index.html` | edit | `#icon-undo` and `#icon-redo` into the shared sprite; the content modal's two buttons become `<use>` — §10.1 |
| `public/css/table-layouts.css` | edit | drop `width: fit-content` from `.table-controls`, and the plate comment with it — §10.1 |
| `public/js/editing/refresh-file-state.js` | edit | only if §13.2 lands as one render per batch |
| ~~a confirmation dialog~~ | **not used** | §10.3 drops the modal on both paths, so `showWarningModal()` is not part of this plan |

**`undo-cell-edits.js` is separate from `save-cell-edit.js`** because it is the only module that knows
an edit can be stale. Everything about writing bytes stays in one place, as §6.2 arranges it.

**What says a refusal happened is still unwritten** — §13.1. The app has no toast or notification
module, and the flash of §10.2 covers success on screen and nothing else.

---

## 13. What is still open

Six questions, none of them about where the controls go. The first two change what gets built; the
last four are mechanical and want a decision recorded rather than discovered halfway through.

### 13.1 What a refusal says, and where

**§3's refusal is not optional** — it is the one path where someone asked for something and nothing
happened, and it has to say why, naming the property and the file, since "it changed since" is only
useful if you know where to look. The flash of §10.2 says nothing about it, and there is no toast
module to reach for.

The same surface has to cover the batch that visibly changed nothing: restore forty-eight values
across twelve files and the rows may be on other pages or filtered out, so **"nothing happened" and
"everything happened" look identical.**

Three candidates:

- **A line in the control row**, in the space the `.flexgrow` spacer now holds — "2 of 50 skipped:
  changed since", fading after a few seconds. It is where the button is, so it is where the eye is
  after a click; it says nothing at all when there is nothing to say; and it costs one element and no
  new module. It is mute for a keyboard press with the table scrolled away from the row.
- **A warning-coloured flash** on the cells that were skipped, `--colour-contr-warning` in place of
  `--colour-contr`, plus nothing else. One mechanism for both answers, and useless for a skip on a
  row that is not on screen — which is most of them.
- **`showWarningModal` as an acknowledge-only alert**, which §10.3 has just thrown out for the
  success path but which is the only surface that cannot be missed. Reasonable for a refusal
  precisely because a refusal is rare.

They are not exclusive: the line plus the warning flash covers both the visible and the invisible
case with one sentence and one colour.

### 13.2 One render per batch, or one per file

`applyRawEdits` calls `refreshFileNow` **once per file**, and does not await it. Two consequences,
and undoing a batch is the first caller to feel either:

- **The flash needs the render to have happened**, so the refresh has to be awaited (§10.2).
- **A batch across twelve files is twelve refreshes and twelve full re-renders of the table.**
  `save-cell-edit.js` already says so in a comment — "which a batch across several files will have to
  change: it re-reads and re-renders per file, where a batch wants to re-read all of them and render
  once". That change was assigned to paste. **Undoing a batch is the first multi-file caller**, so it
  lands here instead.

The question is whether 11a does it or 11b does. Doing it in 11a means `applyRefresh` splitting into
"re-read this file" and "render", which is a real change to a file every save goes through. Deferring
it means 11a awaits a single-file refresh and 11b does the split — and 11a is single-file anyway,
since a batch of more than one only arrives with paste.

Leaning: **defer the split to 11b, await the refresh in 11a.** The `await` is needed either way, and
splitting `applyRefresh` on behalf of a caller that does not exist yet is the abstraction CLAUDE.md
says not to build.

### 13.3 The undo button pressed while a cell is open

The key cannot reach the handler with an editor focused — that is §10.4's third condition. **A click
on the button can**, and it commits the cell on the way in: `focusin` moves to the button, which
collapses the open cell, which writes it. So the press means "undo the edit I just made by clicking
this button", which is arguably what the user wants — except that the commit is asynchronous, so the
new batch may not be on the stack yet when the click handler runs, and undo pops the *previous* one.

Three answers:

- **Await any in-flight commit before popping.** One promise held in `save-cell-edit.js`. The press
  then always undoes the cell just left, which is the intuitive reading.
- **Ignore a press that arrives while a commit is in flight**, and let the button's disabled state
  say so. Simplest, and occasionally drops a press the user meant.
- **Do nothing**, and accept that clicking undo with a cell open is undefined. Not really tenable:
  it is not an exotic sequence, it is "type in a cell, then reach for undo with the mouse".

Leaning: the first. The in-flight flag of §10.4 already exists; this makes it cover the commit as
well as the undo.

### 13.4 How `applyRawEdits` is told to remove a key

§7 says undoing a key the note never had **removes the line rather than writing an empty value**, and
that if the block is left empty the block goes too. `applyRawEdits` has no way to express that today:
every splice it makes replaces a value span, and a `raw` of `''` writes `status:` with nothing after
it — the empty value §7 exists to avoid.

So it needs a third splice shape, and the record needs no new field: `existed: false` is already
there, and §7 deliberately checks "is the block empty now" at undo time rather than recording a flag
that could go stale.

But the `expect` check has a hole underneath it. For a created key the record's `before` is `''`, and
`''` is what `applyRawEdits` computes for **both** "the key is absent" and "the key is present with
an empty value". So a redo whose `expect` is `''` would fire against a key someone has since added
and left blank — and then append a *second* copy of the key, since the redo's write is the
append. The fix is to make absence its own value: `expect: null` meaning "this key must not be
there", distinct from `expect: ''` meaning "its value must be empty".

Decisions wanted: the shape of the removal (a flag on the edit, `raw: null`, or a distinct field),
and whether `expect: null` is the right spelling for absence.

Two smaller ones follow from the same case:

- **If the edit created the front matter block**, undo removing the last key leaves `---\n---\n\n`.
  §7 says remove the block. Does that include the blank line the write added after it? It should —
  the note is otherwise left with a leading blank line it did not have.
- **An empty block that the edit did not create** — a note that already had `---\n---\n` before
  anyone touched it — should presumably be left alone, since §7's rule is about not leaving debris
  behind, not about tidying notes. Worth stating either way.

### 13.5 A batch that was only partly applied

Paste fifty cells, hand-edit two, undo: forty-eight are restored and two are refused (§5). The batch
is popped either way — there is nothing sensible to leave on the stack. **What goes on the redo
stack?**

- **Only the forty-eight that were applied.** The two skipped edits were never reversed, so redoing
  them would be a write nobody asked for — a *new* edit dressed as a redo, overwriting the hand-typed
  value that caused the skip in the first place. This is §3's data loss arriving by the back door.
- **All fifty.** Simpler, and wrong for exactly that reason: the §3 check would catch the two, but
  only because their `before` no longer matches — which is luck, not design.

Leaning: **the applied ones only.** `applyRawEdits` already returns one record per edit that changed
something, so the redo entry is that return value and nothing else — no filtering to write.

### 13.6 The full-width control row

`.table-controls` is `width: fit-content` today, and the comment above it says why: it is meant to
read as "a faint plate holding the layout and what can be done to it" rather than a rule across the
width of the table. Making it full width so undo and redo can be pushed right is the decision taken
in §10.1; this is just the note that **it changes what that row is**, from a plate to a bar.

It carries no background and `border: none`, so in practice nothing is drawn differently — the
controls simply stop huddling. Worth a screenshot before and after rather than an argument.
