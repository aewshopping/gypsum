# Plan: editing cells in the table

Branch: `claude/table-view-types-arch-4yhgmf`
Manifest version now: `1.180.0` → bump the minor version with each step that changes code.
Depends on: `plans/table-value-types.md`, which must be built first.
Related: `plans/yaml-parser.md`, which is built and did most of the hard part.

**Split from `plans/table-value-types-and-editing.md`.** That plan covered two jobs at once. This
is the second: changing a value by typing into a table cell, and having it land safely in the
note's front matter. §7 lists what the split cut and why.

Nothing in this plan has been built yet.

---

## 1. What this is, and what makes it dangerous

Click a cell, type, click away, and the note on disk now says what the cell says.

The danger is not the typing. **It is that front matter is fussy text.** Write the wrong shape and
you do not just lose that one value — a stray colon splits the block into a new key, a leading dash
turns the line into a list item, a line break destroys the block outright, and the note's *other*
properties vanish with it. One careless write can cost a note everything it knew about itself.

So the whole plan is built around three ideas:

1. **Most cells cannot be edited at all**, and the reason follows from where their value comes
   from rather than from a rule someone invented (§2).
2. **Quote defensively rather than validate strictly.** Accept nearly anything the user types, and
   make the *writing* safe instead of policing the typing (§3).
3. **Change the smallest number of bytes that does the job**, never rebuild the block (§4).

### 1.1 The one thing that makes this tractable

**There is no need to turn an edited cell back into an in-memory value.**

The app already has a path that writes a file, re-reads it from disk, re-parses it and rebuilds the
file object: `refreshFileAfterSave` in `public/js/editing/refresh-file-state.js`, which the modal
save already uses. So the editing direction only has to get as far as the file. Everything from
there back into the table is the existing display path, untouched.

That has a pleasant side effect. **What you see after an edit is, by construction, what the file
actually contains.** The round trip is checked every single time instead of assumed.

---

## 2. Most cells are read-only, and the list already exists

The interesting question is not "what type is this?" but **"where did this value come from?"**

| where it comes from | properties | editable? |
|---|---|---|
| the file system | size, last modified, filename, filepath, internal id | no, ever |
| the note's body text | title, tags, colour, preview, links | no, not in this version |
| the front matter | everything else | **yes** |

That one distinction does most of the work you would otherwise try to force onto the types. It is
what separates tag pills from a real editable list without inventing anything, and it is what
stops the table offering to edit a file's size.

### 2.1 The list is already written down

The original plan proposed a new `origin` field on every schema entry. **It is not needed.**
`CORE_FILE_PROPERTIES` in `store.js` already holds exactly this list, for a different-sounding
reason: it is "the keys every file object carries whatever its content", which is to say the keys
written literally into the object `getFileDataAndMetadata` returns, plus the two the loaders add.

Those are the same fact. Anything in that return literal is worked out by the app from the file
system or the body text. Anything *not* in it arrived by spreading the parsed front matter over
the object. So:

> **A property can be edited from the table if it is not in `CORE_FILE_PROPERTIES`.**

`date`, `phone`, `email` and `people` are in `FILE_PROPERTIES` but not in that list, and they are
correctly editable — they do come from front matter. And the rule stays true by itself: anyone
adding a property to the return literal is already told by that list's comment to add it there,
and doing so makes it read-only, which is the right answer.

All this needs is a second sentence in that comment saying the list now has a second job.

### 2.2 Why tags in particular must stay read-only

The tags cell is a merged view with no record of where each tag came from, and three specific
things go wrong if you write to it:

- Body tags are parsed first. Front matter tags are added only if the body did not already produce
  them. After that merge, nothing records which came from where.
- **Deleting a tag that lives in both places, from only one place, looks like it worked and then
  undoes itself on the next load.** That single behaviour would make the feature feel broken.
- The two places do not mean the same thing. `#parent/child` in the body joins the tag taxonomy as
  a child with a parent. The same text in front matter becomes one flat name. So moving a tag from
  one place to the other quietly changes the taxonomy.
- Colour is only ever read from body tags. A colour tag written into front matter would stop
  colouring the note.

**One undocumented behaviour worth knowing while you are in here:** a front matter `title:`
silently overrides the note's H1 heading, and a front matter `color:` silently overrides the colour
tag. This happens because the parsed front matter is spread over the file object after those two
are set, and neither key is on the protected list. So the codebase already holds two different
conflict policies — override for title and colour, merge for tags — and neither is written down.
Worth documenting whatever we do next.

A nice touch for later: render front matter tags and body tags as visually different pills, so it
is obvious why one can be removed and the other cannot.

---

## 3. What "invalid" means, and the policy that follows

Three different things get lumped under that phrase and they deserve different treatment:

1. **Cannot be read as the type.** The column is a date and someone types "next tuesday". This is
   the case everyone imagines and the least dangerous.
2. **Reads fine, but changes meaning on the way back in.** Someone types `007` into a text column,
   it is written plainly, and it comes back as the number seven. This is the group that actually
   damages files, and **almost all of it is solved by quoting defensively when writing, not by
   validating when typing.**
3. **Fine as text, but against an app rule.** A tag with a space in it. A colour that is neither a
   known name nor a hex code. This is policy, not type.

**The policy:** accept nearly everything, quote defensively, and mark a cell whose value does not
fit its column rather than refusing the keystrokes. Reject at entry only where writing would break
the structure of the block, which after quoting is a very short list. Anything that still comes
back wrong reports itself through the existing per-file load error.

Which gives a position that is entirely fair to state out loud: **the app guarantees the file stays
readable, and you own whether the values mean what you intended.**

---

## 4. How saving an edit will work

Eight stages, of which only two are genuinely new:

| # | stage | what it does | new? |
|---|---|---|---|
| 1 | capture | read the text out of the cell | exists — the cell is already editable |
| 2 | guard | may this be edited, has it changed, is the file safe to touch | small |
| 3 | convert | the type turns the typed text into the text that goes after the colon | **new** |
| 4 | locate | find where that key lives inside the front matter | **done** — §4.2 |
| 5 | splice | build the new file text around it | small |
| 6 | write | the existing verified write in `save-file-copy.js` | exists |
| 7 | refresh | the existing re-read and re-render | exists |
| 8 | render | untouched | exists |

**Stage 5 must read the file fresh from its handle**, because the file object keeps only a short
preview, not the raw text. That constraint is forced on us and is the right behaviour anyway.

**Never rebuild the whole front matter block from the parsed values.** That would silently destroy
comments, key order, blank lines and anything the parser skipped without understanding. Replace the
smallest span that does the job and leave every other byte alone.

### 4.1 The write itself is already built

`saveFileCopy` writes a verified copy into `.gypsum`, then overwrites the original only once that
copy has been read back and checked, then deletes the copy. It takes a plain
`{ filepath, filename, content }` object, which a cell edit can build from the file object.

So the new save module is genuinely small: read the file's text, splice, call `saveFileCopy`, call
`refreshFileAfterSave`. It borrows both halves of the safety.

### 4.2 Finding the key is done

`parseYaml` takes an optional `spans` Map and fills it with one entry per top-level key:

```js
{
  valueStart, valueEnd,      // the whole value, for replacing or clearing it outright
  form: 'scalar' | 'block' | 'flow' | 'map',
  items: [ { lineStart, valueStart, valueEnd } ]   // lists only
}
```

Four things about it that matter here:

**It is built into the parser rather than beside it**, because a second implementation of "where
does this value end" would agree with the parser on the day it was written and drift afterwards —
and that drift is a write into the wrong bytes of a note.

**The item spans are what make editing a list safe.** The whole-value span is right for replacing a
list outright, but the usual edit is one item, and splicing one item's span leaves every other byte
alone, including a comment sitting between two items.

**Inserting an item copies its indentation rather than choosing it.** Each item carries its
`lineStart`, so the text from there to its `valueStart` is that item's own prefix — `"  - "`,
`"- "`, or a tab. Nothing in the writer has to know those differ.

**A scalar's span starts immediately after the colon; an item's starts after the dash and its
whitespace.** Not an inconsistency: a scalar span is the whole value slot, so the writer supplies
the separating space and an empty `title:` still works.

### 4.3 What each type writes

Stage 3 is the entire job of the type system in this direction. One small function per type, taking
what the user typed and returning the text to write.

| type | writes | note |
|---|---|---|
| `string` | the text, quoted when it would not read back as itself | the only one needing the quoting rule |
| `number` | the digits plainly, when it reads as a number | otherwise falls back to quoted text |
| `boolean` | `true` or `false` plainly | **not in the type list yet** — see below |
| `date` | a plain ISO date | safe, because it does not read as a number, so it stays text |
| `array` | deferred, see step 5 | the only one that breaks the single-line assumption |

**Yes/no is the one type this plan may have to add.** The types plan dropped it, because on display
and sorting it earns nothing that treating the value as text does not already do. Writing is where
it might pay: a note saying `published: true`, edited in a text column, comes back as the quoted
string `"false"`, so the app has silently changed a real boolean into text. Decide that in step 3,
with the round trip in front of you. If it is worth fixing it costs one entry in the type list and
one line in the convert function.

**The whole pipeline works end to end with no types at all**, if stage 3 is nothing but the quoting
rule. The other types are then small independent additions to one function, and nothing else in the
chain changes. That is what the step order below is built on.

### 4.4 A broken file cannot be edited

**A file whose front matter did not read cleanly has its front matter cells locked** until it is
fixed in the content modal.

This is cheap, because the error is already worked out and already stored per file. It is
explainable, because the load error column is right there in the table. And it stops the editing
path from making a broken block worse. The `- apple: red` case from the parser plan is the reason
to be strict: it parses without complaint into something meaningless, and writing into it would
mean writing into a key the user never created.

---

## 5. The decisions the original plan left open

All five are answered here rather than deferred. They were left open because they could not be
judged before editing existed — but four of the five are answerable by picking the smaller option,
and each one is a line or two to change if it proves wrong.

| question | decision | why |
|---|---|---|
| The same file open in the content modal | Nothing to do, but confirm it | The table is already made uneditable while the modal is open, so the conflict cannot arise. Check it still holds once cells are editable. |
| A property the file does not have yet | **Not editable in version one** | It means inserting a line, and a file with no front matter at all is a much bigger intervention. Making it read-only removes both cases from the first version. Step 4 adds it back for files that already have a block, which is small because we already know where the block ends. |
| Clearing a cell | **Write an empty value; do not delete the key** | A deleted key may unregister the column entirely if no other note carries it. A column vanishing as a side effect of clearing one cell is startling. |
| Re-sorting after an edit | **Do not re-sort** | The existing refresh re-sorts and re-renders. Edit a cell in the column you are sorted by and the row leaps away from under you. Spreadsheets do not do this. One optional argument to `applyRefresh`. |
| A history snapshot per edit | **No, not in version one** | History entries are written when a file is *opened*, not when it is saved, so a cell edit takes no snapshot unless we add one — and a burst of cell edits would fill the history fast. The verified write already refuses to leave a half-written file. If this proves wrong, calling `saveBackupEntry` before the first edit of a file is a one-line addition. |

**The expanded cell closing after an edit is not solved by any of this**, because the refresh
re-renders the whole table regardless. Worth knowing before anyone is surprised by it.

---

## 6. Steps

Five steps, the last of which is optional. Each carries its own tests. Bump the manifest minor
version on each.

### Step 1 — The quoting rule

**What:** one function in `public/js/services/file-parsing/yaml-value-write.js` that decides whether
a piece of text needs quoting to survive being written into front matter and read back as itself.

**Purpose:** this is the safety belt for every write that follows. It is what makes it fair to say
the user owns their own type discipline, because whatever they type, the file stays readable.

**The cases**, all confirmed against the built parser rather than assumed:

- a colon followed by a space, which would split the line into a new key
- a leading dash, hash or quote
- a line break, which destroys the block
- **a value beginning with `[`**, or it reads back as a list. Strictly only when it also ends with
  `]` — the parser leaves `note: [draft] needs work` alone — but the rule should not try to be that
  clever, because the text after the next edit might well end with `]`
- text that would read back as a number, a boolean or a date when it is meant to be text

**Why it is a step of its own:** it is pure text in, text out. No interface, no disk, no state. It
can be tested to death before anything can be damaged by it, and it is the single piece most likely
to be wrong in a way nobody notices for months.

### Step 2 — The first end-to-end edit, text only

**What:** the whole eight-stage pipeline with `string` and nothing else. Read the cell, check it may
be edited, check it changed, quote it, splice it, write it, refresh.

**Includes the guards**, which are the real content of this step:

- the property is not in `CORE_FILE_PROPERTIES` (§2.1)
- the column's type is not `array` (deferred to step 5)
- the file's front matter read cleanly (§4.4)
- the file already has that key
- the text actually changed

**Purpose:** the first closed loop. Proving it works with the simplest possible type is what makes
the remaining types small additions rather than a leap.

**Checkable by:** edit a front matter cell, watch the file on disk change, watch the table redraw
from the file rather than from memory. Screenshots.

### Step 3 — The remaining types

**What:** `number` and `date` added to the convert function, and the yes/no decision from §4.3
taken.

**Purpose:** without this, typing `42` into a number column writes `"42"`, which reads back as text,
which then shows as not matching the column. The types are needed for the round trip to close.

**Why one step and not three:** the original plan gave each type its own step. Each is two to four
lines in one switch, in one file, with one test file covering all of them. Three steps for that is
ceremony. If any one of them turns out to be hard, split it out then.

### Step 4 — Add a key the file does not have yet

**What:** lift the fourth guard from step 2. Editing a cell for a property the note does not carry
appends the line to the end of its front matter block.

**Purpose:** without it, filling in a missing value means opening the note, which undercuts the
point of editing in the table.

**Why it is separate and small:** we already locate the block, so appending is predictable. A file
with **no** front matter block at all stays out of scope: creating one from a cell edit is a bigger
intervention than a cell edit should be, and should need a deliberate action.

### Step 5 — Lists (optional, and probably later)

**What:** an editor that can express several values, and a writer that changes, adds and removes
items in whichever form the file already uses.

**The writing half is nearly free**, because of the per-item spans in §4.2:

| operation | what it is |
|---|---|
| change an item | splice that item's span |
| add an item | copy the prefix from the last item's `lineStart` |
| remove an item | splice from the previous item's `valueEnd` to this one's |
| replace the whole list | the only case that generates structure, and so the only one that picks a form — use the one `span.form` reports |

The only place a style gets chosen at all is the first item added to a key that has none, where
there is no sibling to copy from. Block form, indented two spaces.

**The editing half is a new interface idea**, and that is why this should probably wait. A cell that
can express several values — one per line when expanded, or commas on entry — has no precedent
anywhere in this app. Meanwhile the most common list column, tags, is read-only regardless (§2.2),
and three of the remaining four list properties come from the body text and so are read-only too.
**So this step costs the most and delivers the least**, and list cells staying read-only in version
one is a coherent place to stop.

---

## 7. Where the code goes

| file | new? | why |
|---|---|---|
| `public/js/services/store.js` | edit | one sentence on `CORE_FILE_PROPERTIES`' comment — its second job |
| `public/js/services/property-type.js` | edit | one more function: may this property be edited |
| `public/js/services/file-parsing/yaml-value-write.js` | **new** | a value plus a type becomes the text after the colon, including the quoting rule |
| `public/js/editing/save-cell-edit.js` | **new** | the whole sequence, in one place |
| `public/js/ui/ui-functions-click/cell-edit-commit.js` | **new** | the user finished editing a cell |
| `public/js/ui/ui-functions-click/cell-expand.js` | edit | call the commit handler when collapsing a changed cell |
| `public/js/ui/event-listeners-add.js` | edit | register the new action |
| `public/js/editing/refresh-file-state.js` | edit | the option not to re-sort (§5) |
| `public/js/ui/ui-functions-table/render-cell-value.js` | edit | mark a cell that cannot be edited |
| `public/css/` | new file | any styling for an editing or locked cell |
| `manifest.json` | edit | a minor bump per step |

Three new files, all small, all in folders that already exist.

**Why `yaml-value-write.js` belongs in `file-parsing/`:** that folder already holds both directions
of the same format — `yaml-replace-frontmatter.js` writes, the rest read. It only works out text,
which keeps it easy to test and impossible to damage a file with on its own.

**Why `save-cell-edit.js` belongs in `editing/`:** that folder already holds this exact species of
thing — `save-current-file.js`, `autosave.js`, `rename-file.js`, `refresh-file-state.js` — and it
reuses two of them.

**`cell-expand.js` keeps its current job and does not grow.** It owns selecting, expanding and
collapsing. When it collapses a cell whose text has changed, it calls the commit handler. It
decides nothing about types, values or files.

**Every new file should come in under about eighty lines**, which is where most of this codebase
sits. If one grows much past that it is doing two jobs. The likeliest offender is
`save-cell-edit.js`, since it co-ordinates the others.

---

## 8. What the split cut, and why

The original plan had six steps on this side plus a trailing tests step. This one has five, one of
them optional.

**The `origin` schema field is gone.** §2.1: the list already exists as `CORE_FILE_PROPERTIES`, and
a three-way origin field would record a distinction the app never actually asks about — it only ever
asks "may I edit this?". A new field on fifteen schema entries replaced by one sentence of comment.

**The three type steps became one.** Step 3.

**The open decisions are not a step.** The original had a step for deciding them once editing could
be felt. But four of the five are answerable by taking the smaller option now, and a step whose
content is "have the argument later" is a step that lets the argument block the release. They are
decided in §5, each with the line of code that reverses it.

**Lists are demoted to optional.** Step 5 explains it. This is the single biggest saving available,
and the one most worth pushing back on if it feels like giving up: the point is that the hard half
is the multi-value cell editor, not the writing, and the writing is the half this plan is about.

**"Update the tests" is not a step**, for the same reason as in the types plan. Each step carries
its own.

---

## 9. Conventions to hold to

- No new dependencies, no build step, no framework. Vanilla modules and plain CSS.
- One file, one job, and under about eighty lines.
- Services do not touch the page. Renderers hold no logic. Click handlers stay thin. This is the
  rule that decides the whole file layout in §7, so it is the one to hold hardest.
- Each new module gets a `@file` comment saying **why** it exists, not what it does.
- New CSS goes in its own component file, never bolted onto an existing one.
- All state stays in `appState`.
- JSDoc on everything exported.
- Bump the manifest minor version on every code change.
- **Do not build for types we do not have.**
