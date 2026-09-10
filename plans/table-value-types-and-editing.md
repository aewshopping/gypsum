# Plan: value types for the table, and editing table cells

Branch: `claude/table-view-types-arch-4yhgmf`
Manifest version now: `1.173.0` → bump the minor version with each step that changes code.

This plan is the write-up of a design discussion. Nothing here has been built yet.

---

## 1. Why a proper type system is necessary

In plain English.

A note's front matter can hold all sorts of things. A number, a date, a yes/no answer, a
list of names. Right now the app barely distinguishes between them. It has a short list of
labels — string, number, date, array — attached to the handful of properties the app itself
knows about. Anything you invent yourself gets no label at all, and the app quietly treats
it as text.

That is fine while the table only *shows* things. It stops being fine the moment you want
to *change* things.

Here is the problem. When you type something into a table cell, the app has to write it
back into a text file. To do that it has to answer three questions, and it currently cannot
answer any of them:

- **How should this look on screen?** A date should read as a date, not as a long computer
  timestamp. A yes/no should be a tick box, not the word "true".
- **What is the user allowed to type?** If the column holds numbers, typing "about thirty"
  should not silently become nonsense.
- **What exactly gets written into the file?** This is the dangerous one. Front matter is
  fussy text. Write the wrong shape and you don't just lose that one value, you break the
  whole block and the note's other properties vanish too.

A type is simply the app's answer to those three questions, decided once per column instead
of guessed every time. That is the whole idea. It is not about being clever or strict. It is
about having somewhere sensible to put the answer.

There is a second reason, which the discussion turned up by accident. Because the app has no
real notion of type, a value it fails to understand doesn't announce itself. It just renders
as `[object Object]` in a cell, or as a plausible-looking line of text that is actually
wrong. A type gives the app a way to say "this value is not what this column expects"
instead of showing you rubbish and hoping you notice.

### The founding rule: changing a type never changes your notes

One rule holds the whole thing together and everything else in this plan depends on it.
**Changing a column's type must never cause a file to be written.**

Here is what that is guarding against. Say you have five hundred notes carrying a `priority`
property, and you set that column's type to number. A few of those notes actually hold text
like "quite high". The app could reasonably decide to tidy up: walk all five hundred files,
convert what it can, and rewrite them so they match the type you just declared. A database
would do exactly that.

It must not. Setting a type changes three things and no others:

- how the cells look
- how the column sorts
- which editor you get when you click a cell

The files themselves sit untouched. The notes holding "quite high" carry on holding "quite
high", and those cells show as not matching the column rather than being quietly converted.

The same applies everywhere a type can change without you editing anything. Switching to a
different saved layout changes types, so it must not rewrite files. Loading a folder whose
saved layout carries types must not rewrite files. Correcting a type you set wrongly
yesterday must not rewrite files.

One distinction worth being precise about. **The type does affect what gets written when you
edit a cell.** If the column is a number, the type is what decides the value goes in plainly
rather than wrapped in quotes. So it is not that types have nothing to do with writing. It is
that a type change on its own is never the trigger. The only trigger is you editing a
specific cell, and then only that one property in that one file is written.

Why this deserves to be the founding rule: it is what makes it safe to hand the type control
to you in the first place. If setting a type could rewrite files, a wrong type would be a real
accident, and every change would need a warning and a confirmation. Because it cannot, a wrong
type is just a column that looks odd until you change it back. That is the difference between
a feature you can experiment with and one you have to be careful around.

---

## 2. How types work today

One list, in `FILE_PROPERTIES` in `public/js/services/store.js`. Each property the app knows
about gets an entry with a `type`, plus a label, a column width and a display order. Two
properties also carry a `search_type` that overrides the type for searching only.

Four type values are in use:

| type | used for | the actual value in memory |
|---|---|---|
| `string` | title, filename, filepath, color, internalId, contentPeek, errorOnLoad | a piece of text |
| `number` | sizeInBytes | a number |
| `date` | lastModified, date | a Date object, or text that reads as one |
| `array` | tags, phone, email, people, internalLink | a Map, or a real list |

When a folder loads, `updateMyFilesProperties` copies each entry into
`appState.myFilesProperties` for the properties that actually appear. **A front matter key
the app has never heard of gets an entry with no type at all.** That is the gap. Everything
downstream then treats it as text by default.

Three parts of the app read the type:

- **Sorting.** `compareByProperty` in `file-object-sort.js` switches on it. Dates become
  timestamps, numbers subtract, text compares case-insensitively, and lists compare by how
  many items they hold rather than by their contents. Empty values always sort to the bottom
  whichever direction you choose.
- **Table rendering.** `renderTableRows` switches on the type to decide what goes in the
  cell. Dates get a readable date. Lists branch again at the last moment: a Map becomes
  clickable tag pills, a real list becomes a bulleted list. Text passes straight through,
  except that two properties are special-cased by name inside that branch to produce the
  open-file link and the file path.
- **Search.** Filter creation and the search-everything sweep both look at `search_type`
  first, then `type`. Only one distinction survives: lists match a whole item exactly,
  everything else matches part of the text. There is a note in that file saying numbers and
  dates were never handled.

The type reaches the table via `resolveColumns`, which copies the schema entry onto each
column. A **saved layout carries only the label, the width and whether the column is shown**.
The type is not saved and the user cannot see or change it.

Nothing else uses types. The grid, list and peek views ignore them entirely. And nothing
checks that a value actually matches its declared type, because values arrive from two
independent places: the object built in `file-info.js`, and the front matter parser, which
guesses a type per value, per file.

---

## 3. What we decided

### 3.1 Column types are set by the user and saved in layouts

The type becomes something you choose from the column menu, and it is stored in the saved
layout alongside the width and the visibility. Consequences:

- **Working out a column's type stops being a simple lookup.** There are now three possible
  answers: what you chose, what the app's built-in list says, and nothing at all. One small
  function must return the answer, and sorting, searching and rendering must all call it.
  Doing this first is cheap. Retrofitting it later is not.
- **Order of precedence:** your choice wins, then the built-in list, then plain text as the
  floor. No guessing from the values. A column that changes type by itself when a note is
  added would be worse than one that is occasionally wrong.
- **There is a state with nowhere to store the choice.** The active layout can be "none",
  meaning built-in defaults. Treat a type change exactly like a width change: mark the
  layout dirty, and it is kept when the layout is saved.
- **Switching layouts becomes meaningful, not just cosmetic.** Today a layout switch only
  moves columns around. Once it carries types, it will also change sort order and which cells
  are editable. That is acceptable only because of the founding rule in §1: switching a layout
  changes what you see, and rewrites nothing on disk.
- **A value that doesn't fit its column needs a look.** Show the raw text, mark the cell as
  not matching, and offer a plain text editor rather than the type's editor. Falling back
  per cell beats blocking the whole column.

### 3.2 Three properties are read-only, and it follows from where they come from

The interesting field to add to the schema is not another type. It is **where the value comes
from**, with three possible answers:

| origin | properties | editable? |
|---|---|---|
| from the file system | size, last modified, filename, filepath, internal id | no |
| from the note's body text | title, tags, colour, preview, links | no, for now |
| from the front matter | everything else | yes |

Only the last group is editable in the first version. That one field does most of the work
you would otherwise try to force the types to do. It is what separates tag pills from a real
editable list without inventing a new type, and it is what stops the table offering to edit a
file's size.

**Why tags in particular must stay read-only.** The table cell for tags is a merged view with
no record of where each tag came from, and three specific things go wrong if you try to write
to it:

- Body tags are parsed first. Front matter tags are then added only if the body did not
  already produce them. After that merge, nothing records which came from where.
- **Deleting a tag that lives in both places, from only one place, looks like it worked and
  then undoes itself** on the next load. That single behaviour would make the feature feel
  broken.
- The two places do not mean the same thing. `#parent/child` in the body joins the tag
  taxonomy as a child with a parent. The same text in front matter becomes one flat name.
  So moving a tag from one place to the other quietly changes the taxonomy.
- Colour is only ever read from body tags. A colour tag written into front matter would stop
  colouring the note.

There is also an existing, undocumented behaviour worth knowing: **a front matter `title:`
silently overrides the note's H1 heading, and a front matter `color:` silently overrides the
colour tag.** This happens because the parsed front matter is spread over the file object
after those two are set, and neither key is on the protected list. So the codebase already
contains two different conflict policies, override for title and colour, merge for tags, and
neither is written down anywhere. Worth documenting whatever we do next.

A nice touch to consider later: render front matter tags and body tags as visually different
pills, so it is obvious why one can be removed and the other cannot, before any editing
exists at all.

### 3.3 Unknown properties fall back to text, and the user owns the consequences

Agreed. If a property has no declared type it is text, and from there it is up to the user to
keep their own system straight. **One caveat, which is important.** Text as a fallback solves
the *type* question but not the *escaping* question.

A piece of text containing a colon followed by a space splits the front matter into a new key.
Text starting with a dash becomes a list item, text starting with a hash becomes a comment,
and text containing a line break destroys the block. None of that is a type failure; it is
front matter syntax. So the text type still needs one rule for when to wrap a value in
quotes.

That rule is small, it lives in one place, and once it exists the position becomes entirely
fair: **the app guarantees the file stays readable, and the user owns whether the values mean
what they intended.**

### 3.4 What "invalid entry" means

Three different things get lumped under that phrase and they deserve different treatment:

1. **Can't be read as the type.** The column is a date and someone types "next tuesday".
   This is the case everyone imagines and the least dangerous.
2. **Reads fine, but changes meaning on the way back in.** Someone types `007` into a text
   column, it is written plainly, and it comes back as the number seven. This is the group
   that actually damages files, and **almost all of it is solved by quoting defensively when
   writing, not by validating when typing.**
3. **Fine as text, but against an app rule.** A tag with a space in it. A colour that is
   neither a known name nor a hex code. This is policy, not type.

**The chosen policy:** accept nearly everything, quote defensively, and mark a cell whose
value does not fit its column rather than refusing the keystrokes. Reject at entry only where
writing would break the structure of the block, which after quoting is a very short list.
Anything that still comes back wrong can report itself through the existing per-file load
error, rather than needing a new mechanism.

---

## 4. Bugs found in the front matter parser while discussing this

These were found by running the parser directly, not by reading it. They are the reason the
plan starts with parser work rather than type work.

A list in front matter renders as `[object Object]` in the table under certain conditions.
**Quoting the items makes no difference. Only the whitespace before the dash matters.**

| what comes before the dash | result | error recorded? |
|---|---|---|
| one or more ordinary spaces | a proper list, shown comma-separated | — |
| a tab | an empty object, shown as `[object Object]` | yes |
| a non-breaking space | an empty object, shown as `[object Object]` | yes |
| nothing, flush against the left margin | an empty object, shown as `[object Object]` | yes |
| a dash line containing a colon and a space | a nonsense object | **no** |

Four separate faults, all landing on the same symptom:

1. **Indentation is measured in ordinary spaces only.** The loop that counts indentation only
   steps over the space character, so a tab or a non-breaking space reads as no indentation
   at all.
2. **A list flush with its key is rejected outright.** The parser discards the key's context
   when the indentation is not greater than the key's own, then finds no parent and records
   "root level list item unsupported". **This shape is perfectly valid front matter and
   several editors produce it.** This is the real bug of the four.
3. **The colon check runs before the dash check.** A line reading `- apple: red` is treated
   as a key and value, so the key becomes the literal text `- apple`. **This one records no
   error at all**, which makes it the worst of the set.
4. **The leftover empty object is what makes it ugly.** A key with nothing after the colon
   creates an empty object as a placeholder for the nesting expected to follow. When the
   following lines fail, that placeholder stays. It counts as a real value, so it reaches the
   cell and prints as `[object Object]`.

Two notes on severity. Tabs and non-breaking spaces are genuinely not valid front matter
indentation, so rejecting them is defensible and the app only needs to say so more clearly.
A list flush with its key is valid and common, so that is a straightforward bug.

And the comma-separated appearance of a working list is not a deliberate choice either. An
untyped property falls through to the default branch, which drops the value straight into the
cell, and a JavaScript list turns into its items joined by commas.

**The cheapest worthwhile fix, which stands entirely on its own:** when a key ends up holding
an empty placeholder object, store nothing instead. Every case above then produces a blank
cell alongside the load error that is *already being recorded*, rather than a cell that reads
`[object Object]`. That is the difference between a note that looks corrupted and a note that
is visibly flagged, and it needs no type system to get there.

**Types cannot fix any of this.** The type layer sits downstream of the parser and cannot
recover a list the parser threw away. Types make a bad value legible. They do not repair it.

---

## 5. How saving an edit will work

The key realisation: **there is no need to convert an edited cell back into an in-memory
value.** The app already has a path that writes a file, re-reads it from disk, re-parses it
and rebuilds the file object. That is `refreshFileAfterSave` in
`public/js/editing/refresh-file-state.js`, and the existing save already uses it.

So the editing direction only has to get as far as the file. Everything from there back into
the table is the existing display path, untouched. That has a pleasant side effect: **what you
see after an edit is, by construction, what the file actually contains.** The round trip is
checked every single time instead of assumed.

Eight stages, of which only two are new:

| # | stage | what it does | new? |
|---|---|---|---|
| 1 | capture | read the text out of the cell | exists as an editable cell |
| 2 | guard | is this property editable, has it actually changed, is the file safe to touch | new-ish |
| 3 | convert | the type turns the typed text into the text that goes after the colon | **new** |
| 4 | locate | find where that key lives inside the front matter | **new** |
| 5 | splice | build the new file text around it | small |
| 6 | write | the existing verified write in `file-save.js` | exists |
| 7 | refresh | the existing re-read and re-render | exists |
| 8 | render | untouched | exists |

Two things about stage 5. It must read the file fresh from its handle, because the file object
does not keep the raw text, only a short preview. That constraint is forced on us and is the
right behaviour anyway.

And **stage 4 must find the key's whole span, not just its line.** Replacing only the text
after the colon would orphan any lines beneath it and wreck the block. Lists need this
because their values sit on following lines. Broken input needs it too, which makes it
compulsory rather than a refinement.

Editing must never rebuild the whole front matter block from the parsed values. That would
silently destroy comments, key order, blank lines and anything the parser skipped without
understanding. Replace the smallest span that does the job and leave every other byte alone.

### 5.1 What each type does when writing

Stage 3 is the entire job of the type system in this direction. One small function per type,
taking what the user typed and returning the text to write.

| type | writes | note |
|---|---|---|
| text | the text, quoted when it would not read back as itself | the only one needing the quoting rule |
| number | the digits plainly when it reads as a number | otherwise falls back to quoted text |
| yes/no | `true` or `false` plainly | the parser already handles both, perfect round trip |
| date | a plain ISO date | safe, because it does not read as a number so it stays text |
| list | dash items on the following lines | **the one that breaks the single-line assumption** |

**Lists are the awkward one.** The parser handles dash lists but not the bracketed inline
form, so a list has to be written across several lines. That makes stage 4 a range rather
than a line, and it means the cell editor needs a way to express several values, whether
that is one per line in the expanded cell or separated by commas on entry.

**There is a good incremental path here.** The whole pipeline works end to end with no types
at all, if stage 3 is nothing but the quoting rule. Numbers, yes/no, dates and lists are then
four independent improvements to one function, each addable on its own, and nothing else in
the chain changes.

### 5.2 The rule that keeps editing safe

**A file whose front matter did not read cleanly has its front matter cells locked** until
the user fixes it in the content modal.

This is cheap because the error is already worked out and already stored per file. It is
explainable because the load error column is right there in the table. And it stops the
editing path from making a broken block worse. The colon case in §4 is the reason to be
strict, because it currently parses without complaint into something meaningless, and writing
into it would mean writing into a key the user never created.

---

## 6. Decisions still open

Four the pipeline cannot answer for us.

- **The same file open in the content modal.** Already handled: the app makes the table
  uneditable while the modal is open, so this conflict cannot arise. Worth confirming that
  still holds once cells become editable.
- **A property the file doesn't have yet.** Editing it means inserting a line. Appending at
  the end of the block is predictable. A file with no front matter at all is a bigger
  intervention, and should probably need a deliberate action rather than happening silently
  from a cell edit.
- **Clearing a cell.** Write an empty value, or delete the key? These differ on the next
  load, because a deleted key may unregister the column entirely if no other note has it.
  Leaning towards writing an empty value, because a column vanishing as a side effect of
  clearing one cell is startling.
- **Re-sorting after an edit.** The existing refresh re-sorts and does a full re-render. Edit
  a cell in the column you are sorted by and the row leaps somewhere else, and the expanded
  cell closes because a render discards cell state. Spreadsheets do not do this. Deferring
  the re-sort until the next explicit sort is probably what we want.

And one more: whether a table edit should create a history snapshot the way a modal save
does. Consistency says yes, since it is the same kind of change to the same file. But a burst
of cell edits would fill the history quickly.

---

## 7. Steps

Each step is meant to be finishable and checkable on its own. Bump the manifest minor version
on each one that changes code.

### Step 1 — Stop the parser leaving empty placeholder objects behind

**What:** when a front matter key ends up holding an empty placeholder object, store nothing
instead.

**Purpose:** turns every parse failure in §4 from a cell reading `[object Object]` into a
blank cell plus the load error that is already being recorded. It is the smallest change in
this plan and the one with the best ratio of benefit to risk. It stands alone and needs
nothing else in this plan to be worth doing.

### Step 2 — Fix the three real parser faults

**What:** count tabs as indentation, accept a dash list sitting flush with its key, and check
for the dash before checking for the colon so that `- apple: red` is at least recorded as an
error rather than silently mangled.

**Purpose:** valid front matter should parse. Right now a list written flush against the left
margin, which is a shape several editors produce, is thrown away. Everything later in this
plan assumes the parser gets the value right, so this has to come before the type work rather
than after it.

**Care needed:** the flush-list fix touches the same indentation logic that handles nesting.
Test nested keys and lists inside lists before and after.

### Step 3 — Make "what type is this column?" a single function

**What:** one function that answers the question, consulting the layout first, then the
built-in list, then falling back to text. Change sorting, searching and table rendering to
call it instead of reading the schema directly.

**Purpose:** this is the enabling step for everything else, and it changes no behaviour on its
own. Doing it now is a handful of small edits. Doing it after types are user-settable means
hunting down three places that quietly disagree with each other.

### Step 4 — Add "where does this value come from" to the schema

**What:** a new field on each property saying whether it comes from the file system, from the
note's body, or from the front matter. Nothing reads it yet.

**Purpose:** this single field is what decides, later, whether a cell can be edited at all. It
also documents in one place a distinction currently spread across several files and several
people's memory.

### Step 5 — Let the user set a column's type from the column menu

**What:** a type option in the existing column menu, stored in the column layout next to the
width and visibility, marking the layout dirty when changed. Saved layouts round-trip it.

**Purpose:** delivers the visible half of the feature. Dates start reading as dates, numbers
sort as numbers, and a column of yes/no values stops reading as the words "true" and "false".
All of this is display and sorting only. Per the founding rule in §1, setting a type here
must not rewrite a single note, however badly the values fit the type chosen. Nothing can be
damaged by getting a type wrong, and changing it back costs nothing.

### Step 6 — Show a value that doesn't match its column

**What:** when a cell's value does not fit the column's type, show the raw text with a subtle
marker rather than pretending.

**Purpose:** honesty. This is what stops the app rendering a plausible-looking cell that is
actually wrong, which is the failure mode that hides problems for months.

### Step 7 — Add the quoting rule

**What:** one function that decides whether a piece of text needs quoting to survive being
written into front matter and read back as itself.

**Purpose:** this is the safety belt for every write that follows. It is what makes it fair
to say the user owns their own type discipline, because whatever they type, the file stays
readable.

### Step 8 — Locate a key's span inside the front matter

**What:** given a file's raw text and a property name, find where that key's value starts and
ends, including any lines that belong to it.

**Purpose:** the foundation of writing. Getting the span right is what lets an edit replace
the smallest possible piece of the file and leave comments, ordering and spacing untouched.
Worth building and testing on its own before anything writes through it, because a bug here
damages files.

### Step 9 — Write one edited cell back, text only

**What:** wire up the full eight-stage pipeline with the text type only. Read the cell, check
it is editable and actually changed, quote it, splice it into the file, write it, and let the
existing refresh path redisplay it.

**Purpose:** the first end-to-end edit. Proving the loop closes with the simplest possible
type is what makes the remaining types small additions rather than a leap.

**Includes:** the lock in §5.2, so a file with a front matter error cannot be edited from the
table.

### Step 10 — Add the remaining types to the write path

**What:** numbers, yes/no and dates, one at a time. Each is a small addition to the convert
stage and nothing else.

**Purpose:** each type earns its own step because each has its own round-trip trap, and they
are easier to check separately than together.

### Step 11 — Lists

**What:** an editor that can express several values, and a writer that produces dash items
across several lines.

**Purpose:** separated deliberately because it is the only type that breaks the single-line
assumption. It needs the span work from step 8 to be genuinely solid, and it deserves its own
attention rather than being squeezed in alongside simpler types.

### Step 12 — Settle the open decisions from §6

**What:** decide and implement what a cleared cell means, whether editing a missing property
inserts a line, whether an edit re-sorts the table, and whether it writes a history snapshot.

**Purpose:** these only become answerable once editing actually works and can be felt. Making
the calls in advance would be guessing.

### Step 13 — Update the tests

**What:** bring the test suite in line with everything above.

**Purpose:** the existing tests cover parsing, layouts and table rendering, all of which this
plan changes. **Deliberately not investigated while writing this plan.** Work out what is
needed when we get here, not before.

---

## 8. Files this is likely to touch

| file | why |
|---|---|
| `public/js/services/file-parsing/yaml-parse.js` | steps 1 and 2, the parser fixes |
| `public/js/services/store.js` | steps 3 and 4, the schema and the origin field |
| `public/js/services/file-object-sort.js` | step 3, read the type through the new function |
| `public/js/ui/ui-functions-search/` | step 3, same |
| `public/js/ui/ui-functions-table/render-table-columns-helper.js` | steps 3 and 5 |
| `public/js/ui/ui-functions-table/render-table-rows.js` | steps 5 and 6, display by type |
| `public/js/ui/ui-functions-click/column-menu.js` | step 5, the type option |
| `public/js/table-layouts/` | step 5, saving the type in a layout |
| a new types module | steps 5, 7, 10 and 11, one place holding each type's behaviour |
| a new front matter writing module | steps 8 and 9, span-finding and splicing |
| `public/js/ui/ui-functions-click/cell-expand.js` | step 9, commit and cancel behaviour |
| `public/js/editing/refresh-file-state.js` | step 12, the re-sorting decision |
| `CLAUDE.md` | the "adding a new file property" recipe changes |
| `manifest.json` | a minor bump per code-changing step |

---

## 9. Conventions to hold to

- No new dependencies, no build step, no framework. Vanilla modules and plain CSS.
- One file, one job. The types module holds type behaviour and nothing else. The front matter
  writer holds writing and nothing else.
- Services do not touch the page. Renderers hold no logic. Click handlers stay thin.
- All state stays in `appState`.
- JSDoc on everything exported.
- Bump the manifest minor version on every code change.
- **Do not build for types we do not have.** Five types, added one at a time, each because
  something needed it.
