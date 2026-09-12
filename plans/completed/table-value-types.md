# Plan: value types for the table

Branch: `claude/table-view-types-arch-4yhgmf`
Manifest version now: `1.180.0` → bump the minor version with each step that changes code.
Related: `plans/completed/table-cell-editors.md` and `plans/table-cell-writing.md`, which depend on this one
and were split from the same discussion. `plans/completed/yaml-parser.md`, which is built.

**Split from `plans/table-value-types-and-editing.md`.** That plan covered two jobs at once:
giving the table a real idea of what a value *is*, and letting you change values from the table.
This half is the first job. Nothing here writes to a file. §6 lists what was cut in the split
and why.

Status: **built**, at manifest version `1.190.0`. §7 records where the code differs from what this
plan said it would be.

---

## 1. Why types are needed

A note's front matter can hold all sorts of things. A number, a date, a list of names. Right now the app barely tells them apart. It has a short list of labels — string, number,
date, array — attached to the handful of properties the app itself knows about. **Anything you
invent yourself gets no label at all**, and the app quietly treats it as text.

A type is the app's answer to two questions, decided once per column instead of guessed every
time:

- **How should this look on screen?** A date should read as a date, not as a long computer
  timestamp.
- **How should this column sort?** Numbers should sort as numbers, not as text, where 10 comes
  before 2.

Later, when cells become editable, the same answer covers a third question: what gets written
into the file. That is the other plan's problem. It is worth knowing it is coming, because it is
why this plan bothers to put the answer in one place rather than three.

### 1.1 There is a real bug here already

This is not only groundwork. A front matter key the app has never heard of has no type, so its
cell falls to the renderer's last branch, which is `value || ''`.

| what the note says | what the cell shows today | what it should show |
|---|---|---|
| `published: false` | *nothing at all* | false |
| `revisions: 0` | *nothing at all* | 0 |

The parser reads `false` and `0` correctly. The cell then throws them away, because in JavaScript
both count as "empty" to the `||` operator. **A value silently vanishing from a cell is the worst
kind of display bug**, because nothing announces it.

**This is not really this plan's work.** Changing `||` to `??` in that branch fixes it outright,
needs no type system, and could ship this afternoon. It is here because it is the evidence that the
app's idea of a value is thinner than it looks, and because it is the only bug the type work was
ever going to fix on its own.

### 1.2 The founding rule: changing a type never changes your notes

One rule holds the whole feature together. **Changing a column's type must never cause a file to
be written.**

Say you have five hundred notes carrying a `priority` property and you set that column to number.
A few of those notes hold text like "quite high". The app could reasonably decide to tidy up:
walk all five hundred files, convert what it can, and rewrite them to match. A database would do
exactly that.

It must not. Setting a type changes three things and no others: how the cells look, how the
column sorts, and — once the other plan lands — which editor you get when you click a cell. The
files sit untouched. The notes holding "quite high" carry on holding it, and those cells show as
not matching the column rather than being quietly converted.

The same applies everywhere a type can change without you editing anything: switching to another
saved layout, loading a folder whose layout carries types, correcting a type you set wrongly
yesterday. None of them writes a file.

**Why this deserves to be the founding rule:** it is what makes it safe to hand the type control
to you at all. If setting a type could rewrite files, a wrong type would be a real accident, and
every change would need a warning and a confirmation. Because it cannot, a wrong type is just a
column that looks odd until you change it back.

---

## 2. How types work today

One list, `FILE_PROPERTIES` in `public/js/services/store.js`. Each property the app knows about
gets an entry with a `type`, plus a label, a column width and a display order. Two properties also
carry a `search_type` that overrides the type for searching only.

Four type values are in use:

| type | used for | the actual value in memory |
|---|---|---|
| `string` | title, filename, filepath, color, internalId, contentPeek, errorOnLoad | a piece of text |
| `number` | sizeInBytes | a number |
| `date` | lastModified, date | a Date object, or text that reads as one |
| `array` | tags, phone, email, people, internalLink | a Map, or a real list |

When a folder loads, `updateMyFilesProperties` copies each entry into `appState.myFilesProperties`
for the properties that actually appear. A front matter key the app has never heard of gets an
entry with no type at all. That is the gap.

**Three parts of the app read the type**, each in its own way:

- **Sorting.** `compareByProperty` in `file-object-sort.js` switches on it. But the *caller* looks
  the type up, and there are six callers, each carrying its own copy of
  `FILE_PROPERTIES.get(property)?.type ?? 'string'`.
- **Table rendering.** `renderTableRows` switches on the type to decide what goes in the cell. Two
  properties are special-cased by name inside that switch, to produce the open-file link and the
  file path.
- **Search.** Two files read `search_type` first, then `type`. Only one distinction survives:
  lists match a whole item exactly, everything else matches part of the text.

The type reaches the table via `resolveColumns`, which spreads the schema entry onto each column.
**A saved layout carries only the label, the width and whether the column is shown.** The type is
not saved, and you can neither see it nor change it.

---

## 3. What we decided

### 3.1 You set a column's type, and the layout remembers it

The type becomes something you choose from the column picker modal, stored in the saved layout
alongside the width and the visibility.

- **Order of precedence: your choice wins, then the app's built-in list, then plain text as the
  floor.** No guessing from the values. A column that changed type by itself when a note was added
  would be worse than one that is occasionally wrong.
- **Working out a column's type stops being a lookup and becomes a question**, with three possible
  answers. One small function must own it, and everything must call that function. Doing this
  first is a handful of small edits. Retrofitting it later means hunting down places that quietly
  disagree.
- **There is a state with nowhere to put the choice.** The active layout can be "none", meaning
  built-in defaults. Treat a type change exactly like a width change: it marks the layout dirty,
  and it is kept when the layout is saved.
- **Switching layouts becomes meaningful rather than cosmetic.** Today it only moves columns
  about. Once it carries types it will also change how the table sorts. That is acceptable only
  because of §1.2: switching a layout changes what you see and rewrites nothing.

### 3.2 The type names stay as they are

The original plan wrote the types out in friendly language — text, yes/no, list. Renaming them
means touching the schema, both switches, the search fallback, the tests and every saved layout
already on disk, for a cosmetic gain and a real migration risk.

**So the stored names stay exactly as they are: `string`, `number`, `date` and `array`.** The
friendly words are labels for the menu only. This is exactly the shape `VIEWS` already has in
`constants.js` — a fixed set of allowed values, each with a label for display — so a `VALUE_TYPES`
list next to it needs no explaining.

| stored name | what the menu says |
|---|---|
| `string` | text |
| `number` | number |
| `date` | date |
| `array` | list |

**There is no yes/no type.** §6 says why the one that was proposed did not survive being asked what
it was for, and it is not wanted for editing either — a note's `true` is already shown, sorted and
searched correctly as text.

That list is the **only** place that says which names are legal. It matters because a layout file
is meant to be hand-edited, so a typo in one must not be able to invent a phantom type.

### 3.3 An unknown property is text, and you own the consequences

If a property has no declared type it is text. From there it is up to you to keep your own system
straight. Four types, no more, and a fifth only when something concrete needs it.

### 3.4 Searching a list as text stays a separate setting

`search_type` already exists in the schema and already decides whether a list is searched by whole
items or by part of the text. It is why `people` and `internalLink` match partially today. The only
thing wrong with it is that it is a hidden schema detail nobody can set.

**So it becomes the second per-column setting, and it stays independent of the type.** Tying it to
the type would mean a column could either render as a list or search as text, never both, and
those two properties prove that both are wanted at once.

The type system still does not reach into search. What changes is only where `search_type` comes
from: the column's layout first, then the schema, then contains text as the default. The filter
object, the operator, the filter pill and all three search functions are untouched.

**The default flips, so the schema entries flip with it.** `people` and `internalLink` lose theirs,
because contains text is now what they get anyway. `tags` gains one, pinning it to exact match,
because a tag pill means that tag and nothing else. See step 3.

### 3.5 A value that does not fit its column gets shown, not hidden

Set a column to date and one note holds "quite high". Today that cell would read **Invalid Date**,
which is the app inventing a fact. Instead it shows the raw text, which is what the file says.

That is the whole rule. No marker, no class, no function asking whether a value fits its type: the
cell showing the file's own words is not misleading, and a badge telling you it does not look like
a date tells you what you can already see. Falling back per cell also beats blocking the whole
column.

---

## 4. Steps

Two steps. Each is finishable and checkable on its own, and each carries its own tests rather than
leaving them to the end. Bump the manifest minor version on each.

### Step 1 — One answer to "what type is this column?" ✅

**What:** a new file, `public/js/services/property-type.js`, exporting one function: given a
property name, return its type — the layout's choice first, then `FILE_PROPERTIES`, then `string`
as the floor, and `string` again for a name that is not in the legal list. Plus `VALUE_TYPES` in
`constants.js`, which is what "legal" means.

Then change every place that currently works the answer out for itself to call it instead:

| file | what it does today |
|---|---|
| `refresh-file-state.js` | `FILE_PROPERTIES.get(property)?.type ?? 'string'` |
| `load-files-click.js` | the same line |
| `create-new-note-click.js` | the same line |
| `create-linked-note.js` | the same line |
| `history-recreate-click.js` | the same line |
| `sort-object.js` | reads the type from the sort control |
| `render-table-columns-helper.js` | spreads the whole schema entry onto the column |

**Purpose:** this is the enabling step, and it changes no behaviour at all. That is the point:
five files currently hold the same line of code, and the moment the answer stops being a simple
lookup, five copies become five chances to disagree.

**Checkable by:** the app behaves identically. Sorting, rendering and layouts all work as before.

### Step 2 — You pick a column's type ✅

**What:** a type control reached from the column picker modal, stored in the column layout next to
the width and the visibility, along with the search setting from §3.4.

**Where it goes, and why it is not two more columns in the modal.** Each picker row is already a
grid: a grip, a label, and one box at the end holding the bin and the show/hide toggle. Two extra
controls sitting on every row would crowd it and would put two dropdowns on screen for every
property whether or not anyone cares about them.

**So the row gains one small icon button, in the same box as the bin**, and clicking it opens a
popover holding both settings. That is the pattern the bin already established: an icon on the row
that leads to the one useful thing to do with that column.

| the popover holds | what it sets |
|---|---|
| **type** | text, number, date, list |
| **search as** | **exact match** or **contains** |

**The words are settled.** These two were "actual type" and "display type" in the discussion. The
second one only governs searching, so it is labelled "search as", and its options say what happens
rather than naming an internal idea: **exact match** finds a note whose list holds that item whole,
**contains** finds one where any item contains what you typed.

**Contains is the default.** It is the forgiving option, and searching for part of a name or
a phone number is the thing people actually try first. `people` and `internalLink` already work
this way, so their hidden `search_type` becomes redundant and is deleted.

**Tags is the one property pinned the other way, and it must be.** A tag pill means that one tag,
so clicking `cat` must not also bring back everything tagged `category`. Under the new default it
would, because tags is a list column with nothing set. So `tags` gains an explicit exact-match entry
in the schema, which is the same mechanism `people` used, pointed the other way.

That is a good trade rather than a workaround. The schema goes from two hidden overrides to one,
and the one that remains states a real decision the app makes about tags instead of quietly
correcting a default that did not suit.

**The setting is disabled unless the type is list**, rather than hidden, so the popover keeps one
shape whichever column it was opened from. Nothing else in the app searches by whole values, so the
choice is meaningless on the other four types.

**A glyph per type**, so the list can be read down rather than one tooltip at a time: a T, a hash,
a calendar and a bulleted list. Each symbol is named after the stored type name, and both the row
renderer and the popover build the id from it, so they cannot drift into drawing different glyphs
for the same type. The tooltip still carries the words, the way the grip and the bin already do.

**The list glyph is bulleted rather than three plain rules**, which is what the drag grip on the
same row already is. Two icons a row apart should not be the same drawing.

**Show it on every row, with no exceptions.** Read-only properties, always-on columns and dead
columns all get one. Setting the type of `lastModified` to text is pointless, but §1.2 means it
cannot break anything, and a rule with no exceptions is one less thing to read the code for.

**The change lands the way every other picker change lands.** The popover writes the chosen values
onto the row as data attributes and updates the icon's tooltip. Nothing else happens until the
dialog closes, when `readPickerIntoLayout` reads the rows back into the layout with the order and
the visibility. Two things come free from taking that path: the reset button undoes a type change
along with everything else, because it repaints the list from the layout, and the dirty flag is
already set on close.

**Storing it is nearly free.** `layoutFromColumnLayout` spreads the whole entry, so both keys ride
into the file on their own. Only the reading direction needs work: `applyLayoutToColumnLayout` must
check both against `VALUE_TYPES` and drop anything else, the same way it already guards labels and
widths.

**The popover anchors to the icon button itself. No proxy.** `#column-menu` needs one because the
table header is moved by a scroll-driven transform and anchor positioning resolves against an
element's pre-transform box. A picker row is not transformed, so the button can be its own anchor.

**Two things about that to get right, both cheap if known in advance.**

**Every row has one of these buttons, so they cannot all carry the anchor name.** Anchor
positioning resolves a shared name to the last matching element in the document, so a name declared
on all of them would attach the popover to the bottom row every time. Only the button whose popover
is open may hold it.

**Declare that name in the stylesheet on a state attribute, never inline.** `tooltip.js` puts its
own `anchor-name` inline on any `[data-tip]` element while its tooltip is showing, and it builds
that value by first clearing the inline one and reading the stylesheet's. It merges rather than
overwrites, which is exactly right for a stylesheet declaration and fatal for an inline one: hover
the button while its popover is open, and an inline name would be wiped and the popover would jump.
So the handler toggles an attribute on the clicked button, and `column-picker.css` hangs the
anchor name off that attribute. Nothing fights, and the tooltip keeps working on the same
element.

**Purpose:** the visible half, and the only step that delivers anything a user can see. Dates read
as dates, numbers sort as numbers, and a list column can be searched by part of its text.

Per §1.2, setting a type here must not rewrite a single note, however badly the values fit the type
chosen. Nothing can be damaged by getting a type wrong, and changing it back costs nothing.

**Three small things ride along with it.**

**A date or a number that will not parse shows its raw text**, not "Invalid Date" and not a blank.
This has to happen here rather than earlier, because the picker is what makes it reachable: today
only the app's own properties are date-typed, and they are always real dates. It is one check in
each of those two branches of the existing cell switch, and the cell then shows what the file
actually says. No marker, no new class, no new file — see §6.

**The two search files read `search_type` from the resolver** rather than straight off the schema,
which is one line each.

**The "adding a new file property" recipe in `CLAUDE.md`** changes, because the answer to "what
type is this" is no longer "whatever the schema says".

**Checkable by:** set a column to date, sort by it, save the layout, reload the folder, and find the
type still there. Set a list column to exact match and check a partial search stops finding it.
Click a tag pill and check it still filters to that tag alone.
Screenshots.

---

## 5. Where the code goes

The type system is deliberately **not** given a folder of its own. The obvious instinct is a
`property-types/` folder holding the lot. It would be wrong, because the parts must live apart:
showing a value produces HTML for the screen, and (in the other plan) writing a value produces
text for a file. **The firmest rule in this codebase is that those two live in different layers.**
A folder promising the type system lives in one place would be a promise it cannot keep.

| file | new? | why |
|---|---|---|
| `public/js/constants.js` | edit | `VALUE_TYPES` — the only list of legal type names |
| `public/js/services/property-type.js` | **new** | the one answer to "what type is this column?" |
| `public/js/services/store.js` | edit | `search_type` off `people` and `internalLink`, onto `tags` |
| `public/js/ui/ui-functions-click/sort-object.js` | edit | ask the new module |
| `public/js/ui/ui-functions-click/load-files-click.js` | edit | ask the new module |
| `public/js/ui/ui-functions-click/create-new-note-click.js` | edit | ask the new module |
| `public/js/ui/ui-functions-click/create-linked-note.js` | edit | ask the new module |
| `public/js/ui/ui-functions-click/history-recreate-click.js` | edit | ask the new module |
| `public/js/editing/refresh-file-state.js` | edit | ask the new module |
| `public/js/ui/ui-functions-table/render-table-columns-helper.js` | edit | carry the resolved type onto each column |
| `public/js/ui/ui-functions-table/render-table-rows.js` | edit | raw text when a date or a number will not parse |
| `index.html` | edit | a `.app-menu` popover holding the two selects, and one icon symbol in the sprite |
| `public/js/ui/ui-functions-table/column-picker-list.js` | edit | the icon button on each row |
| `public/js/ui/ui-functions-click/column-type-set.js` | **new** | open the popover, write the choice onto the row |
| `public/js/ui/ui-functions-click/column-picker.js` | edit | read both keys off the rows when the dialog closes |
| `public/js/ui/event-listeners-add.js` | edit | register the new action |
| `public/js/table-layouts/layout-apply.js` | edit | validate both keys when reading a layout file |
| `public/js/ui/ui-functions-search/a-create-filter-object.js` | edit | `search_type` from the resolver, one line |
| `public/js/ui/ui-functions-search/a-search-every-property.js` | edit | the same line |
| `public/css/column-picker.css` | edit | room for the icon in the row's action box |
| `CLAUDE.md` | edit | the "adding a new file property" recipe changes |
| `manifest.json` | edit | a minor bump per step |

Two new JavaScript files, both small. No new folder.

**On the three switches.** A type name ends up in two switches here, the comparator and the cell
renderer, and a third in the other plan, the value writer. The tidy-minded alternative is one object
per type holding all three behaviours together. **We should not do that.** It would put
HTML-producing code and file-writing code in the same object, which is the exact layer mix this
codebase avoids, and the app already has three switches on the same four types today with no
trouble. Three small switches, kept honest by one list of legal names. Revisit only if a fourth
appears or two of them are caught disagreeing.

---

## 6. What the split cut, and why

The original plan had five steps on this side. This one has three. What went:

**The display type does not drive search.** The original had search calling the new type function.
It should not. `search_type` exists precisely so `people` and `internalLink` can opt *out* of list
behaviour, which is to say it is a search preference and not a display type, and search's only
distinction is list-versus-everything anyway. Feeding it the type you chose for display would mean
setting a text column to list silently switched its search from "contains" to "matches exactly",
and would make list display and text search mutually exclusive.

**What replaced it is smaller:** `search_type` becomes the second per-column setting in §3.4, and
the two search files change one line each — the same expression, sourced from the resolver rather
than straight off the schema. The filter object, the operator, the pill and all three search
functions stay exactly as they are.

**"Where does this value come from" moved to the other plan.** It was step 4 of the original, and
nothing in the display half reads it. It is the field that decides whether a cell can be edited,
so it belongs with editing. It also turns out to need no new field at all — see that plan.

**The whole "cells show every type honestly" step is gone, and the yes/no type with it.** It was a
step of its own until it was asked what it was for, and the answers did not hold:

- **A yes/no type earns nothing on display.** The parser already returns real booleans, and the
  fallback branch prints `false` as the word false once `||` becomes `??`. "Yes" instead of "false"
  is a preference, not a fix.
- **A yes/no type earns nothing on sorting either.** Sorting text runs the values through
  `localeCompare`, and "false" sorts before "true" correctly. The `default: comparison = 0` case
  that would have left it unsorted is unreachable, because every caller already passes `string` as
  its fallback.
- **`render-cell-value.js` only earned itself if the switch was growing.** Without a fifth type it
  grows by two lines.

**What survives is two lines and one check.** `||` becomes `??`, which is a bug fix that does not
need this plan at all, and a date or number that will not parse falls back to its raw text, which
rides along with step 2 because the picker is what makes it reachable.


**The type names are not changed.** §3.2.

**"Update the tests" is not a step.** It was step 13 of the original, deliberately uninvestigated.
A step that says "make the tests pass at the end" is a step that invites three broken steps
first. Each step here carries its own.

---

## 7. What was built, where it differs

Both steps are done. Three things are worth knowing that the plan did not say.

**The search setting needed no fallback to the type, and that made it smaller.** `propertySearchType`
consults the layout, then the schema, then contains text. It never asks what type the column is, so
the two questions are genuinely independent in the code and not just in the prose.

**Every column now carries an explicit type in a saved layout.** The picker reads each row's data
attributes back on close, including rows nobody touched, so a layout written after this records the
type of every column rather than only the changed ones. That matches how the label and the width
already behave — a saved layout keeps what it was saved with, even after the schema's defaults
change — but it does make layout files wordier.

**`phone` and `email` changed behaviour, which was not called out anywhere.** Both are list
properties with no `search_type`, so under the old rule they fell back to their type and matched
whole items. Under the new default they are searched by part of their text. That is the intended
default and an improvement for both, but it is a behaviour change nobody asked for by name.

**The two column-menu tests that fail here were failing before any of this.** They cover the header
menu following its column on horizontal scroll, which this plan does not touch. Worth a look on
their own account.

**Two interface faults found in use, and what they turned out to be.** Both are recorded because
each was invisible from the code and obvious in the browser.

**Nothing in the popover could be clicked, on any row.** Not the selects — the popover was parked
at body level, and `showModal()` makes everything outside the dialog inert. It was painted in the
top layer, looked completely right, and swallowed every click. It lives inside the dialog now. The
lists of buttons replaced the selects anyway, for a second reason: a native select's dropdown is
painted outside the popover's box, so choosing an option would have counted as a click outside and
light-dismissed the popover before the choice landed.

**The popover opened in the corner of the screen about one click in ten, then came back.** §4 of
this plan warned that tooltip.js writes an `anchor-name` inline and that a stylesheet declaration
survives it. What it missed is that tooltip.js builds that value from what is computed *when the
tooltip appears*. The anchor was named under `[data-anchored]`, which is not set until the click —
so hovering the glyph first, which is what every real click does, froze a value without it. The
"second or two" was the tooltip's own lifetime. The anchor now sits on a bare span around the
glyph, which carries no tooltip for anything to write over.

**The type picker ended up a dialog, not a menu, and that settled three problems at once.** Two
faults and one design rule pushed the same way:

- **It was inert.** Parked at body level, it was painted in the top layer above the column picker,
  looked entirely right, and swallowed every click, because `showModal()` makes everything outside
  the dialog inert.
- **It lost its anchor.** `tooltip.js` writes an `anchor-name` inline built from what is computed
  when the tooltip appears, so hovering the glyph before clicking it — which is every real click —
  froze a value from before the anchor existed, and the menu opened in the corner of the screen
  until the tooltip hid.
- **A header cell opens one menu and one only.** That rules out reaching the type picker as a
  second menu hanging off the header, however it is anchored.

A dialog is neither a menu nor inert, and needs no anchor, which is what lets one element serve
both callers. What survived the change is everything that was not about position: the host element
carrying the type, the commit that runs on close, the option lists built from `constants.js`, and
the current-choice marking.

**Two things in the table came with it.** The header now carries the same glyph the picker does, so
a column says what it is without anything being opened. And the sort chevron is hidden with
`display` rather than `visibility`, because reserving its width on every unsorted column cost more
than the glyph did and had already pushed the narrowest heading into an ellipsis.

**The dialog ended up with no headings, and the glyphs are why.** Each type row carries the same
drawing the table header and the picker row show for it, which says what the list is without a word
over it. The two search options then sit indented under the list row they belong to, which is the
whole of what says they are subordinate — and the indent has to clear the glyph as well as the
words, or the two sets of labels come out level and read as a second list rather than a nested one.

**The header's two marks are a pair.** The type glyph is hard against the right edge on every
column and the sort chevron sits inside it, because the glyph is on every header and the chevron on
one: the mark that lines up down the table is the one that should be flush. They share a colour and
a weight, so they read as two marks rather than as a mark and a piece of text.

**The mismatch marker came back, and the reason is worth recording.** §6 of this plan cut it,
arguing that showing the file's own words is not misleading. That was true while the table only
displayed things. It stops being true once a click on a cell has to decide what to do: a matching
text cell and a mismatched one read identically, so an editor working from the screen would open a
text editor over a list and write the wrong shape back. `valueFitsType()` is the answer both the
renderer and the editing work ask, and `data-mismatch` on the cell is what the editor can key on
without reading anything.

**Three things were quietly broken until this was tested in the browser**, all of them from
branches that assumed the value matched the type:

| | |
|---|---|
| tags under any single-value type | the cell read `[object Map]` |
| any single value under the list type | the cell was blank |
| tags set to "search text" | tag search returned nothing at all, ever |

The first two are one fix: a value that does not fit shows its text, a Map by its tag names. The
third is the text search learning to read a Map, which turns a setting that silently broke search
into one that does something useful — "plan" now finds "planning".

**The file column is the one column with no type at all.** It is `internalId` wearing an open-file
link, so its cell never shows its value. Sorting it, searching it and typing it are all about an id
nobody is shown, and all three are now refused: in the column menu, in the sort dropdown, in the
search box, and on its picker row. `TABLE_VIEW_COLUMNS.control_columns` names the fact, and
`shown_always` turns out to be the same fact from the other side.

**The marker on its own was not enough, and the reasons are worth keeping.** Four faults, all found
by looking at it rather than by reading it:

- **It still looked editable**, and it was: `cell-expand.js` gives a caret to any cell opened twice,
  and a marker it never reads changes nothing. A mismatched cell now opens without one.
- **The styling was a collision.** The dotted underline was character-identical to an unresolved
  internal link, and a dotted underline is already a search highlight and the load-error nudge too.
  It is the load-error's warning tint now, with no restyle at all.
- **Nothing said what was wrong.** The cell now carries the sentence on its tooltip, and shows the
  same string inside itself when opened — a tooltip needs a pointer, and half the people using this
  have a finger.
- **There were two faults being shown as one.** A list in a date column is the column's type being
  wrong, and changing it back fixes every cell at once. "quite soon" in a date column is the note
  being wrong, and only opening the note fixes it. They are told apart and say so.

**The lock is the same shape as one the editing plan already has** for a file whose front matter did
not read cleanly: not editable here, fix it in the note. That is the answer to what a click on a
mismatched cell does, decided before the editing work starts rather than during it.

**The explanation keeps its column's width.** Widening it was tried and put back: an opened cell
grows rightward, so on the last column — which is exactly where a newly typed property sits — the
sentence ran off the edge of the table. The sentences are short enough to wrap instead.
