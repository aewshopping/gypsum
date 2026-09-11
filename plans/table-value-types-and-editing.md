# Plan: value types for the table, and editing table cells

Branch: `claude/table-view-types-arch-4yhgmf`
Manifest version now: `1.173.0` → bump the minor version with each step that changes code.
Related: `plans/yaml-parser.md`, split out of §4 of this plan. **It is built** — steps 1, 2 and 8
below are done, and §4 says what that changes for the rest.

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

## 4. The parser work this depends on — done

**Built as `plans/yaml-parser.md`**, at manifest version `1.177.0`. The discussion that produced
this plan turned up four faults in the front matter parser, written up in §0 of that plan. They
are fixed, along with three shapes the parser used to reject and one piece of data loss.

**What this plan can now assume.** Each of these was an open risk when this plan was written.

| | |
|---|---|
| a list flush with its key | read, where it used to be thrown away |
| a tab- or nbsp-indented list | read |
| `tags: [a, b]` on one line | read as a list |
| `- apple: red` | read as an item and reported, not silently turned into a key named `- apple` |
| a key left holding nothing | dropped, so the cell is blank rather than `[object Object]` |
| `note: Infinity` | stays text |
| a key's exact character span, and each list item's | available from `parseYaml` — see §4.1 |
| a note whose whole front matter is unreadable | still recognised and reported, so §5.2's lock still fires |

**Three consequences this plan has to absorb**, each handled where it arises below.

1. **Lists can now arrive in two written forms**, block or flow, and the writer must return the
   one it found rather than imposing a house style. §5.1.
2. **The quoting rule grows two cases**, because a value beginning with `[` would read back as a
   list. §7 step 7.
3. **Step 8 is done, and its shape is richer than this plan assumed** — per-item spans, not one
   span per key. §4.1, and it changes step 11 for the better.

### 4.1 The reverse parser, as built

`parseYaml` takes two optional out-params after the text, and a fourth argument for callers that
already know where the block is:

```js
parseYaml(text, errors, spans, indices)
```

Pass a `Map` as `spans` and it comes back holding one entry per **top-level** key:

```js
{
  valueStart, valueEnd,      // the whole value, for replacing or clearing it outright
  form: 'scalar' | 'block' | 'flow' | 'map',
  items: [ { lineStart, valueStart, valueEnd } ]   // lists only
}
```

Omit `spans` and nothing is recorded, which is what every existing caller does.

**Four things about it that matter to the steps below.**

**The item spans are what make editing a list safe.** The whole-value span is right for replacing
a list outright, but the usual edit is one item, and splicing one item's span leaves every other
byte alone — including a comment sitting between two items, which a whole-value rewrite would
have destroyed without noticing it was there.

**Inserting an item copies the indentation rather than choosing it.** Each item carries its
`lineStart`, so the text from there to its `valueStart` is that item's own prefix — `"  - "`,
`"- "`, or a tab. Nothing in the writer needs to know those are different, which is how §5.1's
shape preservation stops being a rule somebody has to remember.

**A scalar's span starts immediately after the colon, an item's after the dash and its
whitespace.** Not an inconsistency: a scalar span is the whole value slot, so the writer supplies
the separating space and an empty `title:` still works. An item span is the value text alone.

**Spans describe the file, the returned object describes what was understood.** A key holding
nothing is pruned from the object but keeps its span, which is correct — the key is in the file,
so an edit should be able to write into it.

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
| 4 | locate | find where that key lives inside the front matter | **done** — §4.1 |
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

**Stage 4 is now done** (§4.1), and it turned out to answer more than this. It reports each list
item's span as well as each key's, so editing one item of a list is a splice of that item and
nothing else — the surrounding items, and any comment between them, are never rewritten.

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
| list | items in the form the file already uses | **the one that breaks the single-line assumption** |

**Lists are the awkward one, though less so than when this was written.** The parser reads both
the block form and the bracketed inline form, and the writer must return whichever the file
already used rather than imposing one. §4.1 is why that costs nothing: the span reports the form,
and an added item copies its indentation from the item above it, so no code anywhere decides
between a flush list and an indented one.

What is still awkward is the cell editor. It needs a way to express several values, whether that
is one per line in the expanded cell or separated by commas on entry, and that half is untouched
by the parser work.

**There is a good incremental path here.** The whole pipeline works end to end with no types
at all, if stage 3 is nothing but the quoting rule. Numbers, yes/no, dates and lists are then
four independent improvements to one function, each addable on its own, and nothing else in
the chain changes.

### 5.2 The rule that keeps editing safe

**A file whose front matter did not read cleanly has its front matter cells locked** until
the user fixes it in the content modal.

This is cheap because the error is already worked out and already stored per file. It is
explainable because the load error column is right there in the table. And it stops the
editing path from making a broken block worse. The `- apple: red` case in §0 of the parser
plan is the reason to be
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
on each one that changes code. **§8 says which file each step belongs in and why.**

### Steps 1 and 2 — The parser work ✅

**Done, as `plans/yaml-parser.md`.** §4 above lists what changed and what this plan may now
assume.

**What this plan needed from them, and now has:** front matter that parses into the right value,
a blank cell rather than `[object Object]` when it does not, and an error recorded every time
something is skipped. Step 9 relies on that last one for the lock in §5.2, and the parser now
reports five distinct failures where it used to report two and stay silent about the worst.

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

**Two cases the built parser adds**, both confirmed against it rather than assumed:

- **A value beginning with `[` needs quoting**, or it reads back as a list. Only when it also
  ends with `]` — the parser leaves `note: [draft] needs work` alone — but the quoting rule
  should not try to be that clever, because the text after the next edit might end with `]`.
- **An item written into a flow list needs quoting if it contains a comma, a bracket or a
  quote.** Items written into a block list do not: a block item runs to the end of its line.

### Step 8 — Locate a key's span inside the front matter ✅

**Done, as the `spans` out-param on `parseYaml`.** §4.1 has the shape. It is built into the
parser rather than beside it because a second implementation of "where does this value end" would
agree with the parser on the day it was written and drift afterwards, and that drift is a write
into the wrong bytes of a note.

It arrived richer than this step asked for: per-item spans as well as per-key. **That is what
makes step 11 smaller**, not larger — see there.

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

**What:** an editor that can express several values, and a writer that edits, adds and removes
items in whichever form the file already uses.

**Purpose:** separated deliberately because it is the only type that breaks the single-line
assumption.

**Smaller than it was**, because step 8 arrived with per-item spans. Three of the four operations
need no decisions at all:

| operation | what it is |
|---|---|
| change an item | splice that item's span |
| add an item | copy the prefix from the last item's `lineStart`, per §4.1 |
| remove an item | splice from the previous item's `valueEnd` to this one's |
| replace the whole list | the only case that has to generate structure, and so the only one that has to choose a form — use the one `span.form` reports |

**The only place a style gets chosen** is the first item added to a key that currently has none,
where there is no sibling to copy from. Block form, indented two spaces.

**What is left for this step is the editor, not the writer.** A cell that can express several
values is now the harder half.

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

## 8. Where the new code goes, and how it is structured

The aim here is that someone reading this codebase cold can still open any one file and
understand it in a minute. Everything below is chosen to keep that true.

### 8.1 The main decision: no new folder for "types"

The obvious instinct is to make a `property-types/` folder and put the whole type system in
it. **We should not.** Here is why.

The existing folders that group a feature together — `table-layouts/`, `pagination/`,
`internal-links/` — each hold parts that genuinely belong side by side. The type system is
different, because its parts must live apart. Showing a value produces HTML for the screen.
Writing a value produces text for a file. **The firmest rule in this codebase is that those
two things live in different layers**: services never touch the page, renderers never contain
logic. A folder called `property-types/` would promise that the type system lives in one
place, when most of it cannot and should not.

So the type system is deliberately spread out, and one small file holds the part that is
genuinely shared.

### 8.2 Where each piece goes, and why

**The list of type names → `public/js/constants.js`, next to `VIEWS`.**

`VIEWS` is already exactly this shape: a fixed set of allowed names, each with a label for
display, shared across the app. `store.js` already imports it from there. A `VALUE_TYPES` list
alongside it is the same idea and needs no explaining to anyone who has read the file.

This list is the **only** place that says which type names are legal. That matters, because
a typo elsewhere should not be able to invent a phantom type.

**"Where does this value come from" → `public/js/services/store.js`, on `FILE_PROPERTIES`.**

Schema lives with schema. This is a new field on the entries that are already there, in the
same map, right where someone adding a property will be looking anyway. No behaviour goes in
store.js, only the facts.

**Answering "what type is this column?" → one new file, `public/js/services/property-type.js`.**

A small module sitting beside `file-props.js` and `file-object-sort.js`, which are its closest
relatives. It holds two or three short functions and nothing else:

- the effective type of a property: what the user chose, then the built-in schema, then plain
  text
- whether a given value actually fits that type
- whether a property can be edited at all, from the origin field

It touches no page elements and no files on disk. **Everything asks it rather than reading
the schema directly.** That is the whole point of the file: today three different places read
the type their own way, and once the user can change types those three would quietly disagree.

One file, not a folder, because this is the only genuinely shared part.

**Showing a value in a cell → `public/js/ui/ui-functions-table/render-cell-value.js`.**

Lift the existing switch out of `render-table-rows.js`. That file then does what its name
says: builds the row, applies the colour, checks pagination. The new file does one thing:
turn a value and a type into the contents of a cell.

This follows the pattern already there. The header and the control row are each their own
file next to the row renderer. It does not go in `ui-functions-render/`, because that folder
holds things several views share, and this is table-only until something else needs it.

**Writing a value into front matter → one new file in
`public/js/services/file-parsing/`, named `yaml-*` like its neighbours.**

That folder already holds both directions of the same format: `yaml-replace-frontmatter.js`
writes, the rest read. One more fits naturally:

- `yaml-value-write.js` — given a value and a type, produce the text that goes after the
  colon, including the quoting rule

It is the size and shape of `yaml-find.js` sitting next to it. It does not touch the page and
does not write to disk. **It only works out text**, which keeps it easy to test and impossible
to damage a file with on its own.

**Finding where to put that text is not a file here.** An earlier draft of this section had a
`yaml-key-span.js` beside it. The parser plan argued that out and then built it the other way:
the span comes back from `parseYaml` itself, because a second module deciding where a value ends
would drift from the one that parses it, and that drift writes into the wrong bytes of a note.

**Doing the actual save → `public/js/editing/save-cell-edit.js`.**

The `editing/` folder already holds this exact species of thing: `save-current-file.js`,
`autosave.js`, `rename-file.js`, `refresh-file-state.js`. Saving a cell is another one, and it
reuses two of them. This file is the only place that knows the whole sequence: check it can be
edited, work out the text, find the span, splice, write, refresh.

**Click handling → `public/js/ui/ui-functions-click/`, one file per action, thin.**

Following the existing rule, two new small files:

- `cell-edit-commit.js` — the user has finished editing a cell. Reads the text out of the
  element, hands it to the save module, and returns.
- `column-type-set.js` — the user picked a type in the column menu.

Both registered in the action map in `event-listeners-add.js` like every other action.

**`cell-expand.js` keeps its current job and does not grow.** It owns selecting, expanding and
collapsing a cell. When it collapses a cell whose text has changed, it calls the commit
handler. It does not decide anything about types, values or files.

### 8.3 Accepting three switches rather than building a registry

A type name will end up appearing in three places: the sort comparator, the cell renderer and
the value writer. Each will have a small switch on the type.

The tidy-minded alternative is one object per type holding all three behaviours together, so
that adding a type is a single edit. **We should not do that**, for two reasons. It would put
HTML-producing code and file-writing code in the same object, which is exactly the layer mix
the codebase avoids. And the app already has three switches on the same four types today, and
it has caused no trouble.

So: three switches, kept honest by the single list of legal names in `constants.js`. Adding a
type means three small edits in three obvious places, and each one is readable on its own.

Worth revisiting only if a fourth or fifth switch appears, or if a real bug is caused by two
of them disagreeing. Not before.

### 8.4 Rough sizes, as a smell test

Every new file above should come in under about eighty lines, which is where most of this
codebase sits. **If one grows much past that, it is doing two jobs and should be split.** The
most likely candidate is `save-cell-edit.js`, since it is the one that co-ordinates the
others.

### 8.5 The full list

| file | new? | why |
|---|---|---|
| `public/js/services/file-parsing/yaml-parse.js` | **done** | the parser plan's steps, including the `spans` out-param |
| `public/js/constants.js` | edit | the list of legal type names |
| `public/js/services/store.js` | edit | the origin field on the property schema |
| `public/js/services/property-type.js` | **new** | the one answer to "what type is this" |
| `public/js/services/file-object-sort.js` | edit | ask the new module instead of the schema |
| `public/js/ui/ui-functions-search/a-create-filter-object.js` | edit | same |
| `public/js/ui/ui-functions-search/a-search-every-property.js` | edit | same |
| `public/js/ui/ui-functions-table/render-table-columns-helper.js` | edit | carry the type onto each column |
| `public/js/ui/ui-functions-table/render-table-rows.js` | edit | hand cell contents to the new renderer |
| `public/js/ui/ui-functions-table/render-cell-value.js` | **new** | value plus type becomes cell contents |
| `public/js/ui/ui-functions-click/column-menu.js` | edit | room for the type option |
| `public/js/ui/ui-functions-click/column-type-set.js` | **new** | the user picked a type |
| `public/js/table-layouts/layout-apply.js` | edit | save and load the type with the layout |
| `public/js/services/file-parsing/yaml-value-write.js` | **new** | value plus type becomes text to write |
| `public/js/editing/save-cell-edit.js` | **new** | the whole save sequence, in one place |
| `public/js/ui/ui-functions-click/cell-edit-commit.js` | **new** | the user finished editing a cell |
| `public/js/ui/ui-functions-click/cell-expand.js` | edit | call the commit handler when collapsing |
| `public/js/ui/event-listeners-add.js` | edit | register the two new actions |
| `public/js/editing/refresh-file-state.js` | edit | step 12, the re-sorting decision |
| `public/css/` | new file | any styling for a mismatched cell or an editing cell |
| `CLAUDE.md` | edit | the "adding a new file property" recipe changes |
| `manifest.json` | edit | a minor bump per code-changing step |

Seven new files, all small, all in folders that already exist. No new folder, and no file
doing more than one job.

## 9. Conventions to hold to

- No new dependencies, no build step, no framework. Vanilla modules and plain CSS.
- One file, one job, and under about eighty lines. See §8 for where each job goes.
- Services do not touch the page. Renderers hold no logic. Click handlers stay thin. This is
  the rule that decides the whole file layout in §8, so it is the one to hold hardest.
- Each new module gets a `@file` comment saying **why** it exists, not what it does, matching
  the ones already in `file-parsing/` and `table-layouts/`.
- New CSS goes in its own component file, never bolted onto an existing one.
- All state stays in `appState`.
- JSDoc on everything exported.
- Bump the manifest minor version on every code change.
- **Do not build for types we do not have.** Five types, added one at a time, each because
  something needed it.
