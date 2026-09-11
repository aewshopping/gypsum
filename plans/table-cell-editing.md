# Plan: editing cells in the table

Branch: `claude/table-view-types-arch-4yhgmf`
Manifest version now: `1.191.0` → bump the minor version with each step that changes code.
Depends on: `plans/table-value-types.md`, **built**. Related: `plans/yaml-parser.md`, **built**,
which did most of the hard part.

Click a cell, type, click away, and the note on disk says what the cell says.

**Nothing here is built.** Two of its guards arrived early with the types plan — §7.

---

## 1. What makes this dangerous

Not the typing. **Front matter is fussy text.** Write the wrong shape and you do not lose one value,
you lose the block: a stray colon splits it into a new key, a leading dash turns the line into a
list item, a line break destroys it outright, and the note's other properties go with it.

Three ideas hold the plan together:

1. **Most cells cannot be edited**, and which ones follows from where their value comes from rather
   than from a rule someone invented (§2).
2. **Quote defensively rather than validate strictly.** Accept nearly anything typed, and make the
   *writing* safe instead of policing the typing (§3).
3. **Change the smallest number of bytes that does the job.** Never rebuild the block (§4).

### 1.1 The one thing that makes it tractable

**An edited cell never has to become an in-memory value again.** `refreshFileAfterSave` already
writes a file, re-reads it from disk, re-parses it and rebuilds the file object, and the modal save
already uses it. So editing only has to get as far as the file; everything from there back into the
table is the existing display path.

The side effect is the good bit: **what you see after an edit is what the file actually contains**,
checked every time rather than assumed.

---

## 2. Which cells can be edited

The question is not "what type is this?" but **"where did this value come from?"**

| where it comes from | properties | editable |
|---|---|---|
| the file system | size, last modified, filename, filepath, internal id | never |
| the note's body text | title, tags, colour, preview, links | not from the table |
| the front matter | everything else | **yes** |

**The list already exists.** `CORE_FILE_PROPERTIES` in `store.js` is exactly the first two rows: the
keys written literally into the object `getFileDataAndMetadata` returns, plus the two the loaders
add. Anything *not* in it arrived by spreading the parsed front matter over the object. So:

> A property can be edited from the table if it is not in `CORE_FILE_PROPERTIES`.

It stays true by itself — anyone adding a property to that return literal is already told to add it
to the list, and doing so makes it read-only, which is the right answer.

### 2.1 Why tags must stay read-only

This matters more now that lists are editable (§5), because a tags cell looks exactly like a list
you could edit. It is a merged view with no record of where each tag came from, and three things go
wrong if you write to it:

- Body tags are parsed first; front matter tags are added only where the body did not already
  produce them. After the merge, nothing records which came from where.
- **Deleting a tag that lives in both places, from one place, looks like it worked and then undoes
  itself on the next load.** That alone would make the feature feel broken.
- The two places do not mean the same thing. `#parent/child` in the body joins the taxonomy with a
  parent; the same text in front matter is one flat name. Moving a tag between them changes the
  taxonomy. And colour is only ever read from body tags.

---

## 3. What "invalid" means, and the policy

Three different things get lumped together:

1. **Cannot be read as the type.** A date column, and someone types "next tuesday". The case
   everyone imagines, and the least dangerous.
2. **Reads fine, changes meaning on the way back in.** `007` typed into a text column, written
   plainly, read back as seven. This is the group that damages files, and **almost all of it is
   solved by quoting when writing, not by validating when typing.**
3. **Fine as text, against an app rule.** A tag with a space in it. Policy, not type.

**The policy: accept nearly everything, quote defensively, reject at entry only where writing would
break the block** — which after quoting is a very short list. Anything still wrong reports itself
through the existing per-file load error.

Which makes a position that is fair to state out loud: **the app guarantees the file stays readable,
and you own whether the values mean what you intended.**

This governs what may be typed into an editable cell, not which cells those are. A cell whose value
does not fit its column is already refused outright (§7), which is the one case where accepting the
keystrokes risks writing back a shape the column cannot describe.

---

## 4. How saving works

Eight stages, two of them genuinely new:

| # | stage | what it does | new? |
|---|---|---|---|
| 1 | capture | read what was typed out of the cell | exists |
| 2 | guard | may this be edited, did it change, is the file safe to touch | part built — §7 |
| 3 | convert | the type turns what was typed into the text after the colon | **new** |
| 4 | locate | find where that key lives in the front matter | **done** — §4.2 |
| 5 | splice | build the new file text around it | small |
| 6 | write | the existing verified write in `save-file-copy.js` | exists |
| 7 | refresh | the existing re-read and re-render | exists |
| 8 | render | untouched | exists |

**Stage 5 reads the file fresh from its handle**, because the file object keeps only a short
preview. Forced on us, and right anyway.

**Never rebuild the block from the parsed values.** That silently destroys comments, key order,
blank lines and anything the parser skipped. Replace the smallest span that does the job.

### 4.1 The write is already built

`saveFileCopy` writes a verified copy into `.gypsum`, overwrites the original only once that copy
reads back clean, then deletes the copy. It takes `{ filepath, filename, content }`, which a cell
edit can build from the file object. So the new save module is: read the text, splice, call
`saveFileCopy`, call `refreshFileAfterSave`.

### 4.2 Finding the key is done

`parseYaml` takes an optional `spans` Map and fills it with one entry per top-level key:

```js
{
  valueStart, valueEnd,      // the whole value, for replacing it outright
  form: 'scalar' | 'block' | 'flow' | 'map',
  items: [ { lineStart, valueStart, valueEnd } ]   // lists only
}
```

It is inside the parser rather than beside it because a second implementation of "where does this
value end" would agree on the day it was written and drift after, and that drift writes into the
wrong bytes of a note.

**The per-item spans are what make §5 cheap.** Splicing one item leaves every other byte alone,
including a comment between two items. Each item's `lineStart` carries its own prefix — `"  - "`,
`"- "`, a tab — so inserting copies the indentation rather than choosing it.

A scalar's span starts immediately after the colon, so the writer supplies the separating space and
an empty `title:` still works. An item's starts after the dash and its whitespace.

### 4.3 What each type writes

| type | writes |
|---|---|
| `string` | the text, quoted when it would not read back as itself |
| `number` | the digits plainly when it reads as a number, else quoted text |
| `date` | a plain ISO date — see §4.4, which decides what from |
| `array` | §5 |

**Yes/no is a type this plan may have to add.** The types plan dropped it because display and
sorting gain nothing from it. Writing might: a note saying `published: true`, edited in a text
column, comes back as the string `"false"`, so the app has quietly turned a boolean into text.
Decide it in step 3 with the round trip in front of you; it costs one entry in the type list, one
line in the convert function and one control in §4.4.

### 4.4 What the user types into

The plan says a great deal about what each type *writes* and, until now, nothing about what the user
*types into*. A cell is a `contenteditable` div, which is one editor for everything.

**Lists being in scope settles most of this.** Several values cannot be expressed in a plain text
cell that stands for one, so there will be at least one editor that is not the default. The question
is no longer whether to have per-type editors but how many.

| type | what opening the cell gives you |
|---|---|
| text, number | the cell, as now |
| `array` | the cell, one item per line — §5 |
| `date` | **open** — the cell, or a date control |
| yes/no | a tick box, if the type is added at all |

**The date question is the one this plan currently gets wrong.** §4.3 says the writer produces "a
plain ISO date" and never says from what. Someone types `1 March 2026` and there are two answers:

- **Write `2026-03-01`.** The app has silently rewritten what they typed, in a plan whose founding
  rule is that it does not reinterpret notes.
- **Write it as typed.** Honest, but the ordinary act of typing a date produces a cell marked as
  unreadable.

A date control removes the question rather than answering it: what comes back is already ISO, so the
writer has nothing to decide and the user nothing to get wrong. **Decide before step 2**, because
step 2 builds the pipeline the rest plugs into.

**Whatever is decided, `cell-expand.js` does not decide it.** Its job is selecting, expanding and
collapsing. A small module owns "what does opening this cell give you", and `cell-expand.js` asks
it — the same shape as `property-type.js` answering "what type is this".

### 4.5 A broken file cannot be edited

**A file whose front matter did not read cleanly has its front matter cells locked** until it is
fixed in the note. The error is already worked out and stored per file, and the load error column is
right there in the table. It stops the editing path making a broken block worse — the `- apple: red`
case parses into something meaningless, and writing into it would write into a key nobody created.

---

## 5. Lists

A list cell, expanded, shows **one item per line**, and is edited as text.

That is the whole editor. The expanded cell already grows downward without limit, `plaintext-only`
already handles Enter, one item per line is what a block list already looks like in the file, and it
avoids the question a comma-separated box would raise about items containing commas.

On commit, split on newlines, trim, drop empty lines. Then:

| what changed | what is written |
|---|---|
| one item's text, and nothing else | splice that item's span — every other byte, comments included, untouched |
| anything else: added, removed, reordered | replace the whole value span, in the form `span.form` reports |
| the first item into a key with none | block form, indented two spaces — the only place a style is chosen |

**The cost of the second row is a comment sitting between two items of that one list.** Rare, and
the price of an editor that lets you rewrite the whole list at once. Worth knowing rather than
discovering.

**A flow list (`tags: [a, b]`) stays a flow list**, which is where the quoting rule earns its keep:
an item written into flow form needs quoting if it holds a comma, a bracket or a quote. An item in a
block list does not — it runs to the end of its line.

**Tags is not editable** however editable lists become (§2.1), and three of the remaining four list
properties come from the body text. So the lists this reaches are mostly ones the user invented,
which is the right place to start.

---

## 6. Decisions taken

| question | decision |
|---|---|
| The same file open in the note modal | **Nothing to do.** `#file-content-modal` uses `showModal()`, which makes every node outside it inert, so the table cannot be touched while a note is open. |
| A property the file does not have yet | **Not editable in version one.** Step 4 adds it back for files that already have a block. A file with no front matter at all stays out of scope: creating one from a cell edit is a bigger intervention than a cell edit should be. |
| Clearing a cell | **Write an empty value; do not delete the key.** A deleted key may unregister the column entirely if no other note carries it, and a column vanishing as a side effect of clearing one cell is startling. |
| Re-sorting after an edit | **Do not re-sort.** Edit a cell in the column you are sorted by and the row leaps away from under you. One optional argument to `applyRefresh`. |
| A history snapshot per edit | **No.** Snapshots are written when a file is *opened*, so a cell edit takes none unless we add one, and a burst of edits would fill the history fast. The verified write already refuses to leave a half-written file. Calling `saveBackupEntry` before a file's first edit is a one-line change if this proves wrong. |

**The expanded cell closes after an edit** whatever we do here, because the refresh re-renders the
whole table. Worth knowing before it surprises someone.

---

## 7. What already exists

Two of step 2's guards arrived with the types plan, and the harder one is the one that is built.

**A mismatched cell already refuses to be edited.** `typeMismatch()` in `property-type.js` says
whether a value can be drawn as its column's type; `cell-expand.js` opens such a cell without a
caret, and says why in the cell and in its tooltip. The sentence names which of the two faults it
is, because they have different fixes: the column's type is wrong and changing it fixes every cell
at once, or the note is wrong and only opening the note fixes it. That second case is §2's
"read-only, go and edit the note" arrived at from the other direction.

**The file column is refused everything.** `TABLE_VIEW_COLUMNS.control_columns` holds columns whose
cell is a control rather than a value — the file column is `internalId` wearing an open-file link —
and its type, sort order and search are all refused. §2's table calls it uneditable, which
understates it: it is not the value at all.

---

## 8. Steps

Each carries its own tests. Bump the manifest minor version on each.

### Step 1 — The quoting rule

One function in `public/js/services/file-parsing/yaml-value-write.js`: does this text need quoting
to survive being written into front matter and read back as itself?

The cases, all confirmed against the built parser:

- a colon followed by a space, which splits the line into a new key
- a leading dash, hash or quote
- a line break, which destroys the block
- a value beginning with `[`, or it reads back as a list. Strictly only when it also ends with `]`,
  but the rule should not try to be that clever — the text after the next edit might end with one
- text that would read back as a number, a boolean or a date when it is meant to be text
- inside a flow list only: a comma, a bracket or a quote

**Its own step because it is pure text in, text out.** No interface, no disk, no state. It can be
tested to death before anything can be damaged by it, and it is the piece most likely to be wrong in
a way nobody notices for months.

### Step 2 — The first end-to-end edit, text only

The whole pipeline with `string` and nothing else, and the guards, which are the real content:

| guard | built? |
|---|---|
| the property is not in `CORE_FILE_PROPERTIES` | no |
| the property is not a control column | **yes** |
| the value fits the column's type | **yes** |
| the column's type is not `array` — lifted by step 5 | no |
| the file's front matter read cleanly | no |
| the file already has that key — lifted by step 4 | no |
| the text actually changed | no |

**Checkable by:** edit a front matter cell, watch the file on disk change, watch the table redraw
from the file rather than from memory.

### Step 3 — The remaining single-value types

`number` and `date` in the convert function, the §4.4 date decision, and the §4.3 yes/no decision.

Without this, typing `42` into a number column writes `"42"`, which reads back as text and then
shows as not matching the column. The types are what closes the round trip.

### Step 4 — A key the file does not have yet

Lift the sixth guard: editing a cell for a property the note lacks appends the line to the end of
its front matter block. Small, because we already locate the block.

Without it, filling in a missing value means opening the note, which undercuts the point.

### Step 5 — Lists

§5. The writer is nearly free because of the per-item spans; the editor is one item per line in the
expanded cell. Lift the fourth guard.

---

## 9. Where the code goes

| file | new? | why |
|---|---|---|
| `public/js/services/file-parsing/yaml-value-write.js` | **new** | a value plus a type becomes the text after the colon, including the quoting rule |
| `public/js/editing/save-cell-edit.js` | **new** | the whole sequence, in one place |
| `public/js/ui/ui-functions-click/cell-edit-commit.js` | **new** | the user finished editing a cell |
| `public/js/ui/ui-functions-click/cell-editor.js` | **new**, if §4.4 goes beyond the plain cell | what does opening this cell give you |
| `public/js/services/property-type.js` | edit | may this property be edited |
| `public/js/services/store.js` | edit | one sentence on `CORE_FILE_PROPERTIES` — its second job |
| `public/js/ui/ui-functions-click/cell-expand.js` | edit | commit on collapse; ask the editor module what to open |
| `public/js/ui/event-listeners-add.js` | edit | register the new actions |
| `public/js/editing/refresh-file-state.js` | edit | the option not to re-sort |
| `public/css/note-table.css` | edit | styling for an editing cell, beside the mismatch styling already there |

**`yaml-value-write.js` belongs in `file-parsing/`** because that folder already holds both
directions of the format. It only works out text, which keeps it easy to test and impossible to
damage a file with on its own.

**`save-cell-edit.js` belongs in `editing/`** beside `save-current-file.js`, `autosave.js` and
`refresh-file-state.js`, and it reuses two of them. It is the likeliest file to grow past eighty
lines, since it co-ordinates the others.
