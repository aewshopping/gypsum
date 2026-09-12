# Plan: writing a cell edit into the note

Status: **not built.** Two of its guards arrived early with the types plan — §6.
Branch: `claude/table-cell-date-editor-h2at27`
Manifest version now: `1.194.0` → bump the minor version with each step that changes code.
Depends on: `plans/completed/table-value-types.md` and `plans/completed/yaml-parser.md`, **both built**.
Paired with: `plans/table-cell-editors.md`, **which comes first** — it decides what a click on a
cell opens and therefore the shape of what arrives here.

Someone has finished editing a cell. This plan gets what they typed into the note's front matter
without damaging anything else in it.

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

**Two lists, two different promises.** `TABLE_VIEW_COLUMNS.info_columns` — the file link, the size,
the last modified date, the load error — is the permanent one: the app fills those in, and nothing
will ever edit them from a cell. Its guard is **already built** (§6). `CORE_FILE_PROPERTIES` is the
wider, softer one: it also holds `filename`, `title`, `tags`, `colour` and `filepath`, which are not
editable *from the table yet* but could be. Renaming and moving a file are both wanted eventually,
and so is editing a title.

It stays true by itself — anyone adding a property to that return literal is already told to add it
to the list, and doing so makes it read-only, which is the right answer.

### 2.1 Why tags must stay read-only

This matters because a tags cell looks exactly like the editable list of §5. It is a merged view
with no record of where each tag came from, and three things go wrong if you write to it:

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
does not fit its column is already refused outright (§6).

---

## 4. How saving works

Eight stages, two of them genuinely new:

| # | stage | what it does | new? |
|---|---|---|---|
| 1 | capture | read what was typed out of the cell | the editors plan |
| 2 | guard | may this be edited, did it change, is the file safe to touch | part built — §6 |
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
| `date` | the text, as typed, quoted by the same rule as `string` — see below |
| `array` | §5 |

**`date` writes no ISO of its own**, and that is the editors plan's decision, now taken: a date cell
offers a caret *and* a picker, so typed text is written verbatim and the picker is what produces ISO —
before this plan is ever involved. Nothing here reinterprets a date. See `table-cell-editors.md` §4.

---

## 5. Lists

The editors plan hands over an array of strings, in order. Turning that back into front matter uses
the per-item spans where they pay:

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

## 6. What already exists

Two of step 2's guards arrived with the types plan, and the harder one is the one that is built.

**A mismatched cell already refuses to be edited.** `typeMismatch()` in `property-type.js` says
whether a value can be drawn as its column's type; `cell-expand.js` opens such a cell without a
caret, and says why in the cell and in its tooltip. The sentence names which of the two faults it
is, because they have different fixes: the column's type is wrong and changing it fixes every cell
at once, or the note is wrong and only opening the note fixes it. That second case is §2's
"read-only, go and edit the note" arrived at from the other direction.

**A column the app fills in refuses a caret.** `info_columns` covers the file link, the size, the
last modified date and the load error. Its cell opens so a long value stays readable and takes no
caret, silently — unlike a mismatch, nothing is wrong and there is nothing to do about it.

**The file column is refused everything.** `TABLE_VIEW_COLUMNS.control_columns` holds columns whose
cell is a control rather than a value — the file column is `internalId` wearing an open-file link —
and its type, sort order and search are all refused. §2's table calls it uneditable, which
understates it: it is not the value at all.

---

## 7. A broken file cannot be edited

**A file whose front matter did not read cleanly has its front matter cells locked** until it is
fixed in the note. The error is already worked out and stored per file, and the load error column is
right there in the table. It stops the editing path making a broken block worse — the `- apple: red`
case parses into something meaningless, and writing into it would write into a key nobody created.

---

## 8. Decisions taken

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

## 9. Steps

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
- text that would read back as a number or a date when it is meant to be text
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
| the property is not an info column | **yes** |
| the value fits the column's type | **yes** |
| the column's type is not `array` — lifted by step 5 | no |
| the file's front matter read cleanly | no |
| the file already has that key — lifted by step 4 | no |
| the text actually changed | no |

**Checkable by:** edit a front matter cell, watch the file on disk change, watch the table redraw
from the file rather than from memory.

### Step 3 — Number and date

`number` and `date` in the convert function. `date` turned out to be the cheap half: the editors plan
settled on a caret beside a picker, so a date is written as typed and only `number` has anything to
decide.

Without this, typing `42` into a number column writes `"42"`, which reads back as text and then
shows as not matching the column. The types are what closes the round trip.

### Step 4 — A key the file does not have yet

Lift the sixth guard: editing a cell for a property the note lacks appends the line to the end of
its front matter block. Small, because we already locate the block.

Without it, filling in a missing value means opening the note, which undercuts the point.

### Step 5 — Lists

§5, once the editors plan's step 3 is handing over an array of strings. Lift the fourth guard.

---

## 10. Where the code goes

| file | new? | why |
|---|---|---|
| `public/js/services/file-parsing/yaml-value-write.js` | **new** | a value plus a type becomes the text after the colon, including the quoting rule |
| `public/js/editing/save-cell-edit.js` | **new** | the whole sequence, in one place |
| `public/js/ui/ui-functions-click/cell-edit-commit.js` | **new** | the user finished editing a cell |
| `public/js/services/property-type.js` | edit | may this property be edited |
| `public/js/services/store.js` | edit | one sentence on `CORE_FILE_PROPERTIES` — its second job |
| `public/js/ui/ui-functions-click/cell-expand.js` | edit | commit on collapse |
| `public/js/ui/event-listeners-add.js` | edit | register the new action |
| `public/js/editing/refresh-file-state.js` | edit | the option not to re-sort |

**`yaml-value-write.js` belongs in `file-parsing/`** because that folder already holds both
directions of the format. It only works out text, which keeps it easy to test and impossible to
damage a file with on its own.

**`save-cell-edit.js` belongs in `editing/`** beside `save-current-file.js`, `autosave.js` and
`refresh-file-state.js`, and it reuses two of them. It is the likeliest file to grow past eighty
lines, since it co-ordinates the others.
