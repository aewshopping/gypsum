# Plan: writing a cell edit into the note

Status: **built**, every step, at manifest `1.211.0`. Four of its guards arrived early, three with the
types plan and one with the editors plan — §6. Capture arrived with them, and is one expression — §4.
What building it settled, including the two places the design below needed a decision it had left
open, is §11.
Branch: `claude/table-cell-writing-l96h4t`
Manifest version when it landed: `1.211.0`.
Depends on: `plans/completed/table-value-types.md` and `plans/completed/yaml-parser.md`, **both built**.
Paired with: `plans/completed/table-cell-editors.md`, **which comes first** — it decides what a click on a
cell opens and therefore the shape of what arrives here.
Paired with: `plans/table-undo-stack.md`, **which comes last** and is not built — but four of its requirements land in
step 2 of this plan and are awkward to retrofit, so §4.6 states them here. The fourth is the `expect`
argument, which this plan never passes and cannot be added later without a read-then-read race.

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
| 1 | capture | read what was typed out of the cell | **done** — §4.4 |
| 2 | guard | may this be edited, did it change, is the file safe to touch | part built — §6 |
| 3 | convert | the type turns what was typed into the text after the colon | **new** |
| 4 | locate | find where that key lives in the front matter | **done** — §4.2 |
| 5 | splice | build the new file text around it, or the block itself when the file has none | small |
| 6 | write | the existing verified write in `save-file-copy.js` | exists |
| 7 | refresh | the existing re-read and re-render | exists |
| 8 | render | untouched | exists |

**Stage 5 reads the file fresh from its handle**, because the file object keeps only a short
preview. Forced on us, and right anyway.

**Never rebuild the block from the parsed values.** That silently destroys comments, key order,
blank lines and anything the parser skipped. Replace the smallest span that does the job.

**Stages 3 and 5 stay two layers rather than one function** — §4.6, which is where the requirements
that come from outside this plan are gathered.

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
before this plan is ever involved. Nothing here reinterprets a date. See `completed/table-cell-editors.md` §4.

### 4.4 Capture is one expression, and that is not an accident

**`cell.textContent`, for every type.** Three things the editors plan built are what make it true, and
each was a deliberate choice rather than a happy result:

- **a cell holds nothing but escaped text** — the renderers that mean their markup all belong to
  columns that refuse a caret, so `textContent` returns the note's own characters rather than the
  browser's reading of them
- **a date cell's editor is a span beside a button and an input**, none of which contribute text, so
  the swap on opening leaves `textContent` exactly as the renderer wrote it
- **a mismatched cell's explanation never reaches here**, because a cell carrying one takes no caret

So there is no per-type capture to write, and adding one later would be the mistake: a type that
needed special reading would mean the cell had stopped being the value.

### 4.5 What counts as a change

**The text the cell holds now, against the text it held when it opened.** Not against the file's value,
and not as parsed values compared to parsed values.

Comparing against the file's value looks more direct and is wrong, because **rendering a value and
capturing it back is not a round trip** — a list of numbers comes back as a list of strings, and a
padded item comes back trimmed (§5.1). Every one of those would report a change on a cell nobody
touched, and this plan's whole job is writing to files.

Comparing text with text has none of that: if you did not type, the two strings are identical, whatever
the value was and whatever the renderer did with it. It is also type-free, so it is one comparison
rather than four.

**The opening text is stashed on the cell when it opens**, the same way the renderer already leaves
`data-mismatch`, `data-info` and `data-list` — the cell is where a fact about that cell lives, and only
one is ever open. `openEditor` in `cell-editor.js` is where it goes, beside the decision it already
makes about what the cell offers.

### 4.6 The shape the write has to have

Four things about the *shape* of this code, rather than what it does. None of them is undo code, and
two are forced by the pasted range anyway — but all four are awkward to retrofit, and skipping them
means a second module that knows how to splice front matter, which is the drift §4.2 puts the spans
inside the parser to avoid. See `plans/table-undo-stack.md` §6.

**The commit takes a list of edits, not one.**

```js
/**
 * @param {Array<{internalId: string, property: string, text: string}>} edits
 * @returns {Promise<Array<object>>} one record per edit that changed the file
 */
export async function applyCellEdits(edits)
```

Group by file; per file read the text fresh, parse once with `spans`, apply that file's edits, call
`saveFileCopy` once. Step 2's caller passes an array of one and nothing else changes. A pasted range
updating fifty rows cannot be fifty verified write cycles and fifty refreshes, so the batch is the
real shape of the operation rather than a generalisation of it.

**Apply a file's edits back to front, by `valueStart`.** Splice the first key and every later span is
off by the length delta. Working backwards keeps every span valid without recomputing anything — the
standard bug in batch splicing, and free to avoid once it is written down.

**Converting and splicing are two layers.**

| layer | knows about | called by |
|---|---|---|
| `toYamlText(text, type, form)` in `yaml-value-write.js` | types, the quoting rule of step 1 | a cell edit, a paste |
| `applyRawEdits(rawEdits)` in `save-cell-edit.js` | spans, splicing, the write, the guard below | both of those, and undo, and redo |

`applyCellEdits` is then thin: convert through `toYamlText`, hand the results to `applyRawEdits`.

**A raw edit carries an optional `expect`:**

```js
applyRawEdits([{ internalId, property, raw, expect }])
```

`raw` is the text to write; **`expect`, when given, is what the key's value span must currently say
for the edit to happen at all**, and the edit is skipped otherwise. This plan never passes it — a
fresh edit has nothing to expect — so it costs one ignored argument here. It is in the signature
because the alternative is undo reading each file to check and `applyRawEdits` reading it again to
write, with a window between the two: small, but that window is exactly the case the check exists to
catch. The reason is `plans/table-undo-stack.md` §3 and §6.2; the consequence is that commit, undo
and redo end up one function differing only in `raw` and `expect`.
**Undo calls the lower layer, and must** — its text came *out of* the file, so it is already valid
front matter, and sending it back through `toYamlText` would not be faithful: §5.1 shows `[1, 2, 10]`
captures as `["1", "2", "10"]`, so a re-converting undo restores a file subtly unlike the one you had.

**In this plan `applyRawEdits` stays local, not exported.** The split is there because converting a
typed value and putting bytes in a file are different jobs, not for a future caller; exporting it is a
one-word change when the undo plan arrives.

**The write returns what it changed**, one record per edit that actually changed something — which
the §4.5 no-change test has already filtered:

```js
{ internalId, property, before, after, existed }
```

`before` and `after` are the key's **whole value span**, sliced from the file text before and after
the splice — even in step 5, where the write itself splices one item of a list. The write stays as
narrow as §5 makes it; the record stays one shape. `after` needs no re-parse: the item splice happens
inside the key span, so it is `before` with the same replacement applied at the same offset.

`internalId` rather than `filepath`, because `rename-file.js` exists and a rename must not orphan the
record. And **sliced from the file, never from the cell** — §5.1 again: the cell holds a rendering,
the file holds the bytes.

**Nothing in this plan reads that return value.** `cell-edit-commit.js` ignores it.

**One thing a batch will need that a single edit does not**, worth knowing before it surprises
someone: `refreshFileAfterSave` holds *one* queued refresh and cancels the previous one, so calling it
per file across a batch re-parses only the last file and leaves the rest stale in memory — and renders
them. A single edit is unaffected, so this is not step 2's problem; it is the paste's, and undoing a
paste's. The batch path wants "re-read these files, then `renderFiles` once".

---

## 5. Lists

The editors plan hands over an array of strings, in order — read out of the cell by `splitFlowItems()`
in `file-parsing/flow-list.js`, which is the parser's own comma scanner. **No item can contain a line
break**, because that editor splits on one, so the case that destroys a block outright cannot arrive
here. Turning the array back into front matter uses the per-item spans where they pay:

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
block list does not — it runs to the end of its line. **A block list stays a block list too**: the
editor's commas are how a list is shown and typed, never a reason to rewrite the file's own form.
And this rule is not the editor's display rule — see `completed/table-cell-editors.md` §3.2, which explains why
the two must stay separate.

**Tags is not editable** however editable lists become (§2.1), and three of the remaining four list
properties come from the body text. So the lists this reaches are mostly ones the user invented,
which is the right place to start.

### 5.1 Capture is not the inverse of render, and the change test must not assume it is

`joinFlowItems` draws the cell and `splitFlowItems` reads it back, and **the pair does not round-trip
for every value**. Measured against the built functions:

| the file holds | the cell shows | capture returns |
|---|---|---|
| `[1, 2, 10]` | `1, 2, 10` | `["1", "2", "10"]` |
| `["  spaced  "]` | `"  spaced  "` | `["spaced"]` |

Two rows rather than three: there is no boolean here to write one for. `VALUE_TYPES` is text, number,
date and list and nothing else, so a column can never be asked to hold `true` as anything but text.

Neither row is a fault to fix. The parser coerces `1` to a number while the editor deals in text, and
trimming an item is what makes typing tolerable. They matter for one reason: **a cell nobody touched
can capture as something that does not equal what the file holds**, so a change test that compares the
captured array with the file's value would report a change on every list of numbers and rewrite it.

**The test compares text with text** — §4.5.

---

## 6. What already exists

Four of step 2's guards are built, three from the types plan and one from the editors plan — and so is
capture, which was never listed as a risk and turned out to carry one (§4.4).

**A mismatched cell already refuses to be edited.** `typeMismatch()` in `property-type.js` says
whether a value can be drawn as its column's type; `cell-editor.js` opens such a cell without a
caret, and says why in the cell and in its tooltip. The sentence names which of the two faults it
is, because they have different fixes: the column's type is wrong and changing it fixes every cell
at once, or the note is wrong and only opening the note fixes it. That second case is §2's
"read-only, go and edit the note" arrived at from the other direction.

**A column the app fills in refuses a caret.** `info_columns` covers the file link, the size, the
last modified date and the load error. Its cell opens so a long value stays readable and takes no
caret, silently — unlike a mismatch, nothing is wrong and there is nothing to do about it.

**A property that cannot be written refuses a caret**, and that guard now lives in `cell-editor.js` with
the other two — see `completed/table-cell-editors.md` §5.2. `title`, `filename` and `filepath` look editable today
and never were; the editors plan stops them pretending. Step 2's table below drops that row.

**A cell contains nothing but escaped text**, which is what makes capture a single expression rather
than a per-type reader — §4.4. It was built as a precondition for exactly this: before it, a front
matter value holding `a <b> c` rendered as `a  c`, so opening that cell and committing would have
rewritten the note with the browser's reading of it rather than the note's own characters.

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
| A property the file does not have yet | **Editable, and a file with no front matter block at all is included.** Step 4 lifts the guard for both: the key is appended to the block, or the block is written when there is none. Not an edge case — a column exists because *some* file carries that key, so the empty cells in every other row are exactly the ones someone wants to fill in, and a note that has never had front matter is the commonest note there is. |
| Clearing a cell | **Write an empty value; do not delete the key.** A deleted key may unregister the column entirely if no other note carries it, and a column vanishing as a side effect of clearing one cell is startling. **Undoing a key step 4 created is the deliberate exception** — see `plans/table-undo-stack.md` §7: the rule guards against a column vanishing as a *side effect*, whereas there the column only exists because of the edit being undone. |
| Re-sorting after an edit | **Do not re-sort.** Edit a cell in the column you are sorted by and the row leaps away from under you. One optional argument to `applyRefresh`. |
| A history snapshot per edit | **No.** Snapshots are written when a file is *opened*, so a cell edit takes none unless we add one, and a burst of edits would fill the history fast. The verified write already refuses to leave a half-written file. Calling `saveBackupEntry` before a file's first edit is a one-line change if this proves wrong — and worth switching on as a scaffold while steps 2 to 5 are built against test folders, where the cap objection does not bite. |
| Undo | **A separate plan, built last** — `plans/table-undo-stack.md`. It reverses writes made from the table and nothing else, and it is not built on `history.gypsum`: that file stores text, which cannot become wrong, where an edit record is a claim about structure. What this plan owes it is §4.6 and nothing more — including the `expect` argument, which exists because undo is reached by Ctrl+Z and a reflexive gesture cannot afford a read-then-read race. |

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
- a line break, which destroys the block. **Narrower than it was**: Enter is prevented in a one-line
  editor and a list item cannot hold one, because that editor splits on it — so a paste is the only
  route left, and the rule stays for that
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
| the property is not in `CORE_FILE_PROPERTIES` | **yes** — the editors plan, §5.2 |
| the property is not a control column | **yes** |
| the property is not an info column | **yes** |
| the value fits the column's type | **yes** |
| the column's type is not `array` — lifted by step 5 | no |
| the file's front matter read cleanly | no |
| the file already has a front matter block, and that key in it — lifted by step 4 | no |
| the text differs from what the cell opened with — §4.5 | no |

**Built to the shape of §4.6**, which is the other half of this step: `applyCellEdits` takes a list,
converting and splicing are separate layers, `applyRawEdits` carries an `expect` this plan never
passes, and the write returns what it changed. Only one edit ever arrives here, nothing reads the
return value and nothing sets `expect`, so none of it shows — which is the point. Retrofitting any of
the four later means a second module that knows how to splice front matter.

**Checkable by:** edit a front matter cell, watch the file on disk change, watch the table redraw
from the file rather than from memory.

### Step 3 — Number and date

`number` and `date` in the convert function. `date` turned out to be the cheap half: the editors plan
settled on a caret beside a picker, so a date is written as typed and only `number` has anything to
decide.

Without this, typing `42` into a number column writes `"42"`, which reads back as text and then
shows as not matching the column. The types are what closes the round trip.

### Step 4 — A key, or a block, the file does not have yet

Lift the sixth guard. Two cases, and the second is the one worth writing down:

- **a block without that key** — append the line to the end of it. Small, because we already locate
  the block, and the end of it is where a key nobody has ordered belongs.
- **no block at all** — write one at byte 0: `---`, the line, `---`, then the file's existing text,
  untouched from its first character on. An empty file becomes just the block.

**Byte 0, rather than anywhere cleverer.** `findFrontMatterIndices` will accept a block that opens
lower down — blank lines and ATX headings may sit above it, within the first five lines — but it
only does so after ruling out a setext underline above the separator and prose between two
horizontal rules. A separator on the *first* line has nothing above it to be a break between, so it
is taken at its word however the rest of the file is written. That makes byte 0 the one placement
that cannot be re-read as something else, whatever the note starts with: a `# Title`, a paragraph
underlined with dashes, or a thematic break. A leading heading still becomes the title afterwards,
because the title is matched anywhere in the file rather than at its top.

Without this, filling in a missing value means opening the note, which undercuts the point — and for
a note with no front matter it means writing a YAML block by hand, which is the thing the table is
supposed to save you from.

### Step 5 — Lists

§5, once the editors plan's step 3 is handing over an array of strings. Lift the fourth guard.

---

## 10. Where the code goes

| file | new? | why |
|---|---|---|
| `public/js/services/file-parsing/yaml-value-write.js` | **new** | the quoting rule step 1 builds, and `toYamlText` over it: a value plus a type becomes the text after the colon |
| `public/js/editing/save-cell-edit.js` | **new** | the whole sequence, in one place — including the two step 4 cases, since choosing between splicing into a block and writing one is part of building the new file text. Two layers inside it: `applyCellEdits` converts, `applyRawEdits` splices and writes — §4.6 |
| `public/js/ui/ui-functions-cell/cell-edit-commit.js` | **new** | the user finished editing a cell — the folder the editors plan groups this feature into |
| ~~`public/js/services/property-type.js`~~ | **done** | `isPropertyEditable()` answers "may this property be edited", and the header's lock asks it too |
| `public/js/services/store.js` | edit | one sentence on `CORE_FILE_PROPERTIES` — its second job |
| `public/js/ui/ui-functions-cell/cell-editor.js` | edit | stash the opening text in `openEditor`, commit from `closeEditor` — collapsing a cell already goes through there, so `cell-expand.js` needs no change |
| `public/js/ui/event-listeners-add.js` | edit | register the new action |
| `public/js/editing/refresh-file-state.js` | edit | the option not to re-sort |

**`yaml-value-write.js` belongs in `file-parsing/`** because that folder already holds both
directions of the format. It only works out text, which keeps it easy to test and impossible to
damage a file with on its own.

**`save-cell-edit.js` belongs in `editing/`** beside `save-current-file.js`, `autosave.js` and
`refresh-file-state.js`, and it reuses two of them. It is the likeliest file to grow past eighty
lines, since it co-ordinates the others.


---

## 11. What building it settled

Two things the design above left open, and one it had wrong. All three matter to
`plans/table-undo-stack.md`, which calls the same lower layer.

**`raw` may be a function, and a list edit carries its `items`.** §4.6 gives `toYamlText` a `form`
argument, and the only thing that knows a key's form is the parse — which happens inside
`applyRawEdits`, one layer below the caller that has to supply it. So a raw edit's `raw` may be a
function of `(form, itemPrefix)` rather than a string, called during that parse. An undo passes a
plain string, as §6.2 requires, and nothing about its path changes.

The same parse is what tells one item's edit from a rewrite, so a list edit also carries `items` —
the cell's text item by item. Both are additions to the shape §4.6 fixed, not changes to it: the
signature, the batch, the `expect` and the returned records are all as stated.

**An item is not quoted by the same rule as a value.** §9 step 1 writes one rule, and §5 adds the
flow-list characters to it. Built, that rule turned a note's `scores: [1, 2, 10]` into a list of
strings the first time anyone touched an unrelated item of it: a value has to come back as the same
*value*, so `42` in a text column is quoted, but an item only has to come back as the same *text*,
which §5.1 had already conceded when it accepted that a list of numbers captures as strings. So
`yaml-value-write.js` holds the shared half — what would break the block — and two rules over it.
`007` is still quoted in a list, because `7` is not what anyone typed.

**The one-item test compares through the parser's coercion** for the same reason, and this is the
§5.1 trap arriving where it was not predicted: comparing the file's `- 2` with the cell's `"2"` as
text calls every item of every numeric list changed, so a one-item edit would rewrite the whole list
and take the comment between the items with it.

**A note whose front matter did not read cleanly is locked twice**, which §7 asks for once. The
renderer marks the cells, so the caret is refused with a sentence rather than silently; and the
write asks the parser again, because by then it has the file's current bytes and the load's answer
is as old as the load.
