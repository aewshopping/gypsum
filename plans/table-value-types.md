# Plan: value types for the table

Branch: `claude/table-view-types-arch-4yhgmf`
Manifest version now: `1.180.0` → bump the minor version with each step that changes code.
Related: `plans/table-cell-editing.md`, which depends on this one and was split from the same
discussion. `plans/yaml-parser.md`, which is built.

**Split from `plans/table-value-types-and-editing.md`.** That plan covered two jobs at once:
giving the table a real idea of what a value *is*, and letting you change values from the table.
This half is the first job. Nothing here writes to a file. §6 lists what was cut in the split
and why.

Nothing in this plan has been built yet.

---

## 1. Why types are needed

A note's front matter can hold all sorts of things. A number, a date, a yes/no answer, a list of
names. Right now the app barely tells them apart. It has a short list of labels — string, number,
date, array — attached to the handful of properties the app itself knows about. **Anything you
invent yourself gets no label at all**, and the app quietly treats it as text.

A type is the app's answer to two questions, decided once per column instead of guessed every
time:

- **How should this look on screen?** A date should read as a date, not as a long computer
  timestamp. A yes/no should read as yes or no.
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
| `published: false` | *nothing at all* | no |
| `revisions: 0` | *nothing at all* | 0 |
| `due: 2026-03-01` | 2026-03-01, unsorted | a readable date, sorting by date |

The parser reads `false` and `0` correctly. The cell then throws them away, because in JavaScript
both count as "empty" to the `||` operator. **A value silently vanishing from a cell is the worst
kind of display bug**, because nothing announces it. Step 2 fixes it.

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

The type becomes something you choose from the column menu, stored in the saved layout alongside
the width and the visibility.

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

**So the stored names stay `string`, `number`, `date` and `array`, and `boolean` joins them.** The
friendly words are labels for the menu only. This is exactly the shape `VIEWS` already has in
`constants.js` — a fixed set of allowed values, each with a label for display — so a `VALUE_TYPES`
list next to it needs no explaining.

| stored name | what the menu says |
|---|---|
| `string` | text |
| `number` | number |
| `date` | date |
| `boolean` | yes/no |
| `array` | list |

That list is the **only** place that says which names are legal. It matters because a layout file
is meant to be hand-edited, so a typo in one must not be able to invent a phantom type.

### 3.3 An unknown property is text, and you own the consequences

If a property has no declared type it is text. From there it is up to you to keep your own system
straight. Five types, no more, and each one has to earn its place by fixing something — see §1.1
for what `boolean` fixes.

### 3.4 A value that does not fit its column gets shown, not hidden

Set a column to date and one note holds "quite high". Today that cell would read **Invalid Date**,
which is the app inventing a fact. Instead: show the raw text, and mark the cell quietly as not
matching. Falling back per cell beats blocking the whole column, and it beats pretending.

---

## 4. Steps

Three steps. Each is finishable and checkable on its own, and each carries its own tests rather
than leaving them to the end. Bump the manifest minor version on each.

### Step 1 — One answer to "what type is this column?"

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

### Step 2 — Cells show every type honestly

**What:** lift the cell switch out of `render-table-rows.js` into
`public/js/ui/ui-functions-table/render-cell-value.js`, then make it complete:

- **`boolean`** renders as yes or no. **This is the step that fixes §1.1**, because the same
  change removes the `value || ''` fallback that was eating `false` and `0`.
- **A value that does not fit its column** renders as its raw text with a marker class, rather
  than as "Invalid Date" or blank.
- **Sorting learns `boolean` too**, in the existing switch in `file-object-sort.js`. It currently
  falls to `default: comparison = 0`, which means a yes/no column does not sort at all.

**Purpose:** the display half of the feature, delivered before any new interface exists. Everybody
gets the bug fix whether or not they ever open the column menu.

**Why one step and not two:** the original plan had the mismatch marker as a step of its own. But
the renderer has to decide what to do with a value that does not fit *anyway* — that is not a
feature bolted on top, it is the same switch doing its job properly.

**Why the file is worth extracting:** `render-table-rows.js` also builds the row, applies the
colour and checks pagination. The switch is about to grow. It is also the pattern already in that
folder, where the header and the control row each have their own file.

**Checkable by:** a note with `published: false` shows "no". A date column holding nonsense shows
the nonsense, marked. Screenshots, per CLAUDE.md.

### Step 3 — You pick a column's type

**What:** a type control in the existing column menu, stored in the column layout next to the
width and the visibility.

- **The control is a `<select>`, not a submenu.** The menu is a flat list of buttons in
  `index.html`, and a submenu would be a new interface idea. A select listing the five labels is
  one element, and change-events already have a home: `sort-select-change.js` and
  `history-select-change.js` are both wired the same way. `column-menu.js` already knows which
  column it was opened from, so it sets the select's value when the menu opens.
- **Storing it is nearly free.** `layoutFromColumnLayout` spreads the whole entry, so the type
  rides along into the file on its own. Only the reading direction needs work:
  `applyLayoutToColumnLayout` must check the name against `VALUE_TYPES` and drop anything else,
  the same way it already guards labels and widths.
- **Changing it marks the layout dirty**, exactly like a resize.
- **Then re-render.** Types affect display and sort order, so a change has to redraw the table.

**Purpose:** the visible half. Dates read as dates, numbers sort as numbers, a column of yes/no
values stops reading as the words true and false.

Per §1.2, setting a type here must not rewrite a single note, however badly the values fit the
type chosen. Nothing can be damaged by getting a type wrong, and changing it back costs nothing.

**Also in this step:** update the "adding a new file property" recipe in `CLAUDE.md`, because the
answer to "what type is this" is no longer "whatever the schema says".

**Checkable by:** set a column to date, sort by it, save the layout, reload the folder, and find
the type still there. Screenshots.

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
| `public/js/services/file-object-sort.js` | edit | a `boolean` branch in the comparator |
| `public/js/ui/ui-functions-click/sort-object.js` | edit | ask the new module |
| `public/js/ui/ui-functions-click/load-files-click.js` | edit | ask the new module |
| `public/js/ui/ui-functions-click/create-new-note-click.js` | edit | ask the new module |
| `public/js/ui/ui-functions-click/create-linked-note.js` | edit | ask the new module |
| `public/js/ui/ui-functions-click/history-recreate-click.js` | edit | ask the new module |
| `public/js/editing/refresh-file-state.js` | edit | ask the new module |
| `public/js/ui/ui-functions-table/render-table-columns-helper.js` | edit | carry the resolved type onto each column |
| `public/js/ui/ui-functions-table/render-table-rows.js` | edit | hand cell contents to the new renderer |
| `public/js/ui/ui-functions-table/render-cell-value.js` | **new** | a value plus a type becomes the contents of a cell |
| `index.html` | edit | the type select inside `#column-menu` |
| `public/js/ui/ui-functions-click/column-menu.js` | edit | set the select's value on open |
| `public/js/ui/ui-functions-click/column-type-set.js` | **new** | the user picked a type |
| `public/js/ui/event-listeners-add.js` | edit | register the new action |
| `public/js/table-layouts/layout-apply.js` | edit | validate the type when reading a layout file |
| `public/css/` | new file | the marker for a cell that does not match its column |
| `CLAUDE.md` | edit | the "adding a new file property" recipe changes |
| `manifest.json` | edit | a minor bump per step |

Three new JavaScript files, all small. No new folder.

**On the three switches.** A type name ends up in two switches here — the comparator and the cell
renderer — and a third in the other plan, the value writer. The tidy-minded alternative is one
object per type holding all three behaviours together. **We should not do that.** It would put
HTML-producing code and file-writing code in the same object, which is the exact layer mix this
codebase avoids, and the app already has three switches on the same four types today with no
trouble. Three small switches, kept honest by one list of legal names. Revisit only if a fourth
appears or two of them are caught disagreeing.

---

## 6. What the split cut, and why

The original plan had five steps on this side. This one has three. What went:

**Search is not rewired. Dropped.** The original had search calling the new function too. It
should not, for two reasons. First, search reads `search_type || type`, and `search_type` exists
precisely so `people` and `internalLink` can opt *out* of list behaviour — it is a search
preference, not a display type, and the two should not be forced together. Second, search's only
type distinction is list-versus-everything, and `searchArrayProperty` already checks the value's
real shape at the point of use. So feeding it the type you chose for *display* would change search
behaviour nobody asked for: set a text column to list, and searching it would silently switch from
"contains" to "matches exactly". Two files stay untouched and one class of surprise disappears.

**"Where does this value come from" moved to the other plan.** It was step 4 of the original, and
nothing in the display half reads it. It is the field that decides whether a cell can be edited,
so it belongs with editing. It also turns out to need no new field at all — see that plan.

**The mismatch marker folded into the renderer.** Covered in step 2.

**The type names are not changed.** §3.2.

**"Update the tests" is not a step.** It was step 13 of the original, deliberately uninvestigated.
A step that says "make the tests pass at the end" is a step that invites three broken steps
first. Each step here carries its own.
