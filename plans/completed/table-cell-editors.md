# Plan: what opening a table cell gives you

Status: **built**, every step, at manifest `1.195.0`.
Branch: `claude/table-cell-date-editor-h2at27`
Manifest version when it landed: `1.195.0`.
Depends on: `plans/completed/table-value-types.md`, **built**.
Paired with: `plans/table-cell-writing.md`, which takes what comes out of here and puts it in the
note, and which is **not built**. Everything here stops at the DOM: an edit still lives in the cell
and is discarded by the next render.

A cell is a `contenteditable` div today — one editor for everything, never argued for, just
inherited. This plan decides what a click on an editable cell actually opens, per type, and whether
anything is done to what the user typed before it is handed on.

---

## 1. What a cell already does

`cell-expand.js` owns it. One click selects, a second expands, a third collapses. The two steps
exist because cells hold their own clickable things — tag pills, the open button, internal links —
and a single click would compete with them.

An expanded cell is taken out of flow and grows downward only, so the row keeps its height and every
column keeps its width. It is `contenteditable="plaintext-only"`, which keeps pasted markup out.
Nothing is saved: edits live in the DOM and are discarded by the next render.

**Two cases already refuse a caret**, both from the types plan:

- **A cell whose value does not fit its column.** It opens so the value can be read, says why in the
  cell and in its tooltip, and offers no editor. `typeMismatch()` is the test.
- **The file column**, whose cell is an open-file link rather than a value at all.

So "opening a cell does not always mean editing it" is established, and the thing this plan adds is
what the *other* outcomes are.

### 1.1 The precondition: a cell must hold only escaped text

**Fix this before anything else in the plan.** `render-table-rows.js` puts a value straight into the
cell's HTML — `cellContent = value ?? ''`, and the same in the list and mismatch branches. Front matter
holding `note: a <b> c` renders as `a  c`, because the browser reads `<b>` as a tag.

Today that is a display wart. **The moment the cell is the editor it is data loss**: `cell.textContent`
is what the writing plan captures, so opening that cell and committing rewrites the note. Both of this
plan's decisions rest on the cell being the value (§3.4, §4.2), so both depend on this.

Escaping every value the cell renderer emits buys a rule worth holding on to:

> **A cell that takes a caret contains nothing but escaped text.**

It holds because the three renderers that deliberately produce HTML — `renderFilename`,
`renderOpenFileLink` and `renderTags` — belong to `filename`, `internalId` and `tags`, and every one of
those refuses a caret (§5.2, and `control_columns` from the types plan). Nothing that means its markup
is ever inside an editable cell.

**One shared `escape-html.js`**, adopted by the two copies that already exist
(`render-frontmatter-properties.js:9`, `autocomplete/popup.js:6`). Three copies of an escaping function
is how one of them ends up subtly wrong.

---

## 2. The question, and what actually needs an editor of its own

| type | what opening the cell gives you | settled? |
|---|---|---|
| text | the cell, as now | yes — nothing else would help |
| number | the cell, as now | yes — the writing plan accepts and quotes bad input |
| list | the cell, as now, once a list cell renders as one comma-joined line — §3 | yes — §3 |
| date | the cell **and** a date control — §4 | yes — §4 |

**Only the date needs an editor that is not the default.** Lists looked like they forced a second one —
several values cannot be typed into a cell that stands for one — until the cell started rendering the
list as a line of text that can be. So "how many editors" ends at two, and one of them is the one that
was already there.

**It is still a switch on the type**, and the types plan named this as the moment to notice. It argued
for three — the sort comparator, the cell renderer, the value writer — and refused a registry per type,
because HTML-producing and file-writing code should not share an object. What opening a cell gives you
is DOM-producing, so it sits with the renderer rather than with the writer, and the refusal still holds:
**four small switches in four obvious places, not one clever object.**

---

## 3. The list editor

**A list cell renders as one comma-joined line, collapsed and open.** There is then no list editor: an
opened list cell is a plain cell, like text.

The editor's text is **a flow list without its brackets** — items joined with `, `, quoted only where an
item needs it: `"Smith, John", Jane Doe`. That is the same argument a one-item-per-line box would have
made — *what you edit is arranged the way the file arranges it* — except that a flow list is a shape the
format already has, with a scanner already written for it.

### 3.1 What already exists

| what | where |
|---|---|
| splits a comma run into items, **ignoring commas inside quotes** | `flowItemRanges()`, `yaml-parse.js:64` |
| strips the quotes off an item | `coerceValue()`, `yaml-parse.js:16` |
| renders a list as `join(', ')` | `render-file-list-search.js:98` — **the search view has done this all along**, so the table is joining it rather than diverging |
| the flow-item quoting rule | `table-cell-writing.md` §5 — the write half of the round trip is already specified |

### 3.2 A comma inside an item is quoted

Read back with `flowItemRanges()`, the scanner the parser itself uses, so the editor and the file cannot
disagree about where an item ends. That answers the one objection to commas: nothing has to be invented.

**Two quoting rules, doing different jobs. Do not unify them.**

- **The display rule**, here: quote an item holding a comma, a quote character, or leading or trailing
  spaces. Everything else round-trips through the editor untouched.
- **The file rule**, `table-cell-writing.md` §9 step 1: stricter — brackets, colons, leading dashes and
  more, because it protects a YAML block rather than a text box.

So `[draft]` needs no quotes in the editor, which has no brackets of its own to confuse, and does need
them in the file.

### 3.3 A newline separates items as well

**A newline has to mean something, so the only choice is what.** `plaintext-only` lets someone press
Enter, and paste brings newlines in regardless — and an item holding a line break cannot be written to
front matter at all, since the parser is line-based and a line break is the thing that destroys a block
outright. So it either separates items or is silently collapsed into a space.

**Separating is the predictable one.** Enter keeps meaning "new item", which is the one good thing the
one-per-line design had, and pasting a spreadsheet column into a list cell does what it looks like it
should. It also buys a guarantee: **the editor cannot produce an item containing a line break**, which
takes that danger off the writing plan. Quotes do not protect a newline — the split happens first.

**It does not collide with a future paste into a range of cells**, because the two arrive in different
states and the table already tells those apart: a paste into an **expanded** cell is one cell's value by
definition, and a paste into a **selected** cell has no editor to receive it. The constraint to record
now, for that feature: **a range paste is intercepted before a cell editor exists** and splits rows on
newlines and columns on tabs itself, never routing a newline into one cell's editor. That is the same
quote-aware scanning `flowItemRanges()` already does, so it starts with a head start rather than a
conflict. The residual cost, plainly: one spreadsheet column into one list cell is the case this serves,
and a source cell holding its own line break (Alt+Enter in Excel) becomes two items.

### 3.4 What the rendering change costs

Drop the `<ul class="table-view-array-list">` and its now-dead four-line CSS rule. Then:

- **the cell is self-describing** — `cell.textContent` is the editor's text, so nothing swaps on open and
  the editor reads the cell rather than the store, the same property §4.2 buys for dates
- **a clipped cell shows more**: a row is one line tall with `overflow: hidden`, so a bulleted list shows
  roughly its first item where `a, b, c…` shows three
- **tags are untouched** — a Map renders as pills and is not editable (`table-cell-writing.md` §2.1), and
  the note modal keeps its pills, a different view with a different job
- **the cost**: an item containing a comma shows its quotes in the table. Rare, and the alternative is a
  table displaying something it cannot read back

**A single-item list now looks like a text value.** `people: [John Smith]` reads `John Smith`, and typing
a comma makes it two items. That is the flip side of the design rather than a bug, but it is the kind of
thing someone should meet in the plan rather than in the app.

### 3.5 What it still does not do

No reordering by dragging, no × per item, no add button. All three are a pill editor, a different and
much larger piece of work. Typing is enough, and if the plain version turns out to be annoying in use
that is the moment to know what to build instead.

---

## 4. The date decision: both

**Settled: the plain cell *and* a date control, side by side, the user choosing per edit.** Two controls,
and therefore no transformation anywhere in the feature.

| control | what it produces | who decides |
|---|---|---|
| the caret | exactly what was typed, verbatim | the user typing |
| the picker | a plain ISO date, because it cannot produce anything else | the browser |

The three options this section used to weigh all assumed a date cell keeps rendering
`toLocaleDateString()`. That assumption is what made the question hard, and it is the thing to change
(§4.2). Once a date cell shows the file's own text, the first option's cost — the app silently rewriting
the user's words — is gone, because what you see on opening is what the file already holds and an
untouched cell reads back identical. And the control's cost, that it cannot express "about March", is
gone too, because the caret is still there.

**So the writing plan gets no transformation.** Its §4.3 `date` row is **the text, as typed**, quoted by
the same rule as `string`. The picker produces ISO before the writing side is ever involved.

### 4.1 What typing a date actually gets you

`new Date()` decides three things at once — whether a value sorts, whether it renders, and whether it is
marked unreadable — because `file-object-sort.js` and `typeMismatch()` both call it. So one column can
hold several shapes at once and still sort correctly: `2026-03-01` and `1 March 2026` interleave
properly.

| typed | read as |
|---|---|
| `2026-03-01`, `2026/03/01`, `2026-3-1` | 1 March 2026 |
| `1 March 2026`, `1 Mar 2026`, `March 1, 2026` | 1 March 2026 |
| `01/03/2026`, `1/3/2026`, `01.03.2026` | **3 January 2026** |
| `1st March 2026`, `Q1 2026`, `quite soon` | invalid — marked unreadable |
| `1 March` | 1 March **2001** |

**Any format that spells the month as a word is safe.** The trap is the all-numeric ones: `01/03/2026`
parses, so nothing marks it, but it is read the American way round while a British writer meant the
opposite. No check can catch that — the value is valid, just not what was meant.

Which is what the picker is for. The caret is for what a picker cannot express, and for fixing a typo in
a value that is already right.

### 4.2 A date cell must show the file's text

**The one change here that is not additive**, and what lets the two controls coexist at all.

A date cell renders `new Date(value).toLocaleDateString()` today, so a file holding `2026-03-01` shows
`01/03/2026` to a UK reader — and `new Date("01/03/2026")` is **3 January**. Editing what is currently
rendered would move dates by months. Three changes in `render-table-rows.js` close it:

1. **A note's date column shows the file's text.** Drop `toLocaleDateString()`. Most notes hold ISO
   already — the F5 shortcut writes `yyyy-mm-dd` — so usually `01/03/2026` becomes `2026-03-01`.
2. **An info date column keeps the locale rendering.** `lastModified` is a `Date` object, not text from
   a note, and prints raw as `Sun Mar 01 2026 00:00:00 GMT+0000 (…)`. The app owns it, there is no note
   text behind it, and its cell takes no caret. `isInfoColumn()` is already imported in that file.
3. **`N/A` for an empty date goes.** The cell is now the editor, so `N/A` would be text the user is
   invited to edit and the writing plan would put in the file. Empty date cells go blank, like every
   other type.

The payoff: **the cell becomes self-describing.** No raw value in a data attribute, no text swapped on
open, nothing of the user's escaped into an attribute. `cell.textContent` is the value — for the picker
to seed from, and for the writing plan to capture. Sorting is untouched: it reads the file object, never
the cell.

### 4.3 How the two controls share the cell

```html
<div class="note-table-cell is-expanded" data-prop="due">
  <span class="cell-date-text" contenteditable="plaintext-only">2026-03-01</span>
  <button class="cell-date-pick" data-action="cell-date-pick" tabindex="-1"
          aria-label="pick a date" data-tip="pick a date">
    <svg class="type-glyph" aria-hidden="true"><use href="#icon-type-date"></use></svg>
  </button>
  <input type="date" class="cell-date-input" data-action="cell-date-set" tabindex="-1" value="2026-03-01">
</div>
```

- **The editable region is the span, not the cell.** An `<input>` inside a `contenteditable` container is
  a known mess: the caret lands beside it and Backspace deletes it. Outside it, there is nothing to go
  wrong. `keyboard-shortcuts.js` and `keyboard-navigate.js` both test `activeElement.isContentEditable`,
  which is true of the span, so the keys still belong to the caret and neither file changes.
- **`cell.textContent` is still the value.** A button contributes no text and an input's value is not
  text content, so capture stays one expression for every kind of cell.
- **The glyph already exists.** `#icon-type-date` is a calendar. No new symbol.
- **The input holds the value, the button opens the picker.** A visible `input type="date"` would be
  ~120px of `dd/mm/yyyy` segments duplicating the text beside it. Instead it sits over the button at
  `opacity: 0` — rendered, because `showPicker()` needs a box to anchor to — and the button calls
  `showPicker()` on it.
- **Clicking the button must not take the caret.** `addActionHandlers` already has a document `mousedown`
  handler calling `preventDefault()` for the undo and redo buttons, for this exact reason. Add this one
  to it.
- **Clicks inside an expanded cell already reach the delegated map.** `handleCellExpand` returns early for
  an expanded cell, and `clickDelegate` uses `closest('[data-action]')`, which finds the button before the
  cell. The native calendar is browser chrome, so no stray click reaches `handleCellExpandClickOutside`.

**Picking replaces the whole value**, a time component included: `2026-03-01T09:00` becomes `2026-03-01`.
Not silent — the text updates before anything is saved, with the caret right there to undo it.

**Seeding the input:** `new Date(cell.textContent.trim())`, formatted with local getters rather than
`toISOString()`, which shifts a day either side of midnight. An unreadable date never reaches any of
this: it is a mismatch and refuses a caret already.

**Collapsing must put focus back on the cell**, and this is impossible to guess from the symptom.
`handleKeyboardNavigate` requires `document.activeElement` to carry `.keyboard-navigable`, which is the
cell. Focus never leaves the cell today, so nothing shows it; the date editor puts focus on the span and
collapsing removes that span, dropping focus to `<body>` and killing the arrow keys until something is
clicked. One line in `closeEditor`.

---

## 5. Where the choice lives

**Not in `cell-expand.js`.** Its job is selecting, expanding and collapsing, and it should stay that
size. It asks what to open and does it.

One new module owns the answer: given a cell's property and its column's type, what does opening it
give you — the plain cell, the plain cell plus a date control, or nothing at all because the value does
not fit or the property is not editable. That is the same shape as `property-type.js` answering
"what type is this column", and it is what the writing plan's guard step asks too.

| file | new? | why |
|---|---|---|
| `public/js/ui/ui-functions-cell/cell-editor.js` | **new** | what does opening this cell give you: `openEditor` / `closeEditor`, switching on the column's type, plus §5.2's two rules |
| `public/js/ui/ui-functions-cell/cell-date-editor.js` | **new** | builds the date editor, handles the pick click and the input's change |
| `public/js/ui/ui-functions-cell/cell-expand.js` | **moved** | from `ui-functions-click/` — see below |
| `public/js/services/file-parsing/flow-list.js` | **new** | both directions of "a list as one line of text": `splitFlowItems(text)` and `joinFlowItems(items)` |
| `public/js/services/file-parsing/yaml-parse.js` | edit | `export` on `flowItemRanges`, and the quoted-item check pulled out of `coerceValue` |
| `public/js/ui/ui-functions-render/escape-html.js` | **new** | §1.1, adopted by the two copies that already exist |
| `public/js/ui/ui-functions-table/render-cell-value.js` | **new** | the per-type switch, lifted out of `render-table-rows.js` — see below |
| `public/js/ui/ui-functions-table/render-table-rows.js` | edit | keeps the row loop and loses the switch |
| `public/js/ui/event-listeners-add.js` | edit | `cell-date-pick` in the click map, `cell-date-set` in the change map, the button in the existing `mousedown` preventDefault, the editor's Enter in `keyDownDelegate` |
| `public/css/note-table-cell.css` | **new** | the cell's own rules, out of `note-table.css` — see below |
| `public/css/cell-date-editor.css` | **new** | register both in `public/style.css` |

### 5.1 Three moves, each earning its churn

| evidence | move |
|---|---|
| `ui-functions-click/` holds **53 files**, the largest directory in the app, and this feature adds four that only make sense together | **`ui-functions-cell/`**, grouping a feature the way `pagination/` and `history/` already do. `cell-edit-commit.js` joins it from the writing plan. One import line changes |
| `render-table-rows.js` is 151 lines mixing "build a row" with "format a value by type", and both of this plan's decisions land in that switch | **`render-cell-value.js`**: the row loop drops to about 70 lines, and the date and list rendering decisions end up side by side, which is where they argue for each other |
| `note-table.css` is **356 lines** against a 190-line next-largest, in a codebase that split CSS into 27 component files | **`note-table-cell.css`**: `.note-table-cell` with its selected, expanded, mismatch and note rules, with `cell-date-editor.css` beside it |

**`flow-list.js` is already in the right place** and should stay: `file-parsing/` holds
`protected-spans.js`, the folder's other shared scanner, and `yaml-value-write.js`, which the writing
plan puts there for the same reason. The two quoting rules live one each: the **display** rule in
`flow-list.js`, the **file** rule in `yaml-value-write.js`.

**`cell-editor.js` stays a switchboard.** It answers what opening a cell gives you and delegates. The
date editor's DOM and handlers live in their own file, which is what keeps it readable if a third editor
ever arrives.

**Export the scanner rather than moving it.** One definition either way, and exporting is one word
against a working parser. `flow-list.js` imports it and adds the two string helpers; the parser keeps
using it for its spans. A second comma scanner written for the UI is exactly the drift the parser's own
comment warns about — "one scanner serves both the values and their spans, so the two cannot disagree".

**`splitFlowItems` must not call `coerceValue` whole.** That function also coerces types, so `[1, 2]`
would come back as numbers and `true` as a boolean where the editor wants text. It needs only the
quoted-item check, extracted so both callers share one definition of "is this item quoted".

**`closeEditor` is the half that is easy to forget.** `collapse()` today removes `contenteditable` and the
mismatch note. A date cell also has to be unwrapped — set the cell's text back to the read-out value,
which drops the span, the button and the input in one line. It switches on the marker in the cell rather
than re-deriving the type, matching the note the renderer already leaves for `cell-expand.js`: it reads
the cell, not the schema. Only the date branch flattens; a tags cell holds real HTML. A list cell needs
nothing — §3 leaves it holding plain text.

### 5.2 Two rules `cell-editor.js` owns

**Which properties refuse a caret.** Three reasons, and they belong together rather than spread across
two plans: the value does not fit its column, the column is one the app fills in, **and the property
cannot be written** — anything in `CORE_FILE_PROPERTIES`, which is `title`, `filename`, `filepath` and
the file-system columns. Those three look editable today and can never be saved; the writing plan's
guard table drops that row and points here.

The cost, stated: editing a title from the table is wanted eventually (`table-cell-writing.md` §2), and
this pre-empts it. One line to remove when that arrives.

**What Enter does.** `plaintext-only` lets Enter insert a line break, and a line break cannot be written
to front matter at all — the parser is line-based, and the writing plan names it as the thing that
destroys a block outright. So:

| type | Enter |
|---|---|
| list | inserts the break, which §3.3 reads as a new item |
| text, number, date | prevented — later, it commits |

Route it through `keyDownDelegate` beside `handleAutocompleteKeydown`, the established pattern for a key
that is not a `data-action`. Pasting several lines into a one-line cell is the same hazard by another
route, and the writing plan already owns that one: §3's "reject at entry only where writing would break
the block".

---

## 6. Steps

### Step 0 — The precondition and the file moves

§1.1's escaping, `escape-html.js` and its two existing callers, and the three moves in §5. Nothing
changes on screen and no behaviour changes at all, which is what makes it the safe thing to do first.

**Checkable by:** a note whose front matter holds `note: a <b> c` shows that text in its cell, and
`cell.textContent` reads it back identically — the assertion that would have caught the data loss. The
same for `&` and for a quote character. A tags cell still renders pills, proving the escaping did not
reach the renderers that mean their HTML. The moves are covered by the existing suite passing untouched:
`tests/38-table-cell-expand.spec.js` and `tests/45-column-types.spec.js` assert behaviour and class
names, never paths.

### Step 1 — A date cell shows the file's text

§4.2, on its own, with no editor yet.

**The risky half, so it goes first and alone.** It changes what every date cell in the app looks like,
and it is checkable with no new interaction at all. One existing assertion moves with it:
`tests/45-column-types.spec.js` expects `3/1/2026` and becomes `2026-03-01` — which is itself the
argument, since that string reads as 3 January to half the world. Add cases for the empty cell being
blank rather than `N/A`, for `lastModified` still reading as a formatted date, and for a column holding
`2026-03-01` in one note and `1 March 2026` in another sorting the two correctly.

### Step 2 — Move the choice out of `cell-expand.js`

`cell-editor.js` answers the question and `cell-expand.js` asks it. Behaviour identical: the plain
cell for everything editable, no caret for the two cases that already refuse one.

**Its own step because it changes nothing.** That is what makes it safe to check — the existing cell
expand tests should pass untouched.

### Step 3 — Lists render as one comma-joined line

§3: `flow-list.js`, the `export`, the renderer, the dead CSS rule. No editor work — an opened list cell
is the plain cell step 2 already gives it, and `splitFlowItems()` is called by whoever captures the
value, which is the writing plan.

**Checkable without any writing at all:** a list cell reads `John Smith, Jane Doe` collapsed and open,
an item holding a comma shows quoted, typing into it works, and the next render discards the change —
which is what every cell does today.

Unit tests belong in `tests/44-yaml-parser.spec.js`, beside the scanner they borrow: `splitFlowItems`
round-trips with `joinFlowItems` for plain items, an item with a comma, an item with a quote and items
with stray spaces; a newline separates even inside quotes, so no item can hold a line break; empty items
and a trailing comma are dropped, which `flowItemRanges` already does — the test is that the behaviour
is inherited rather than re-implemented. `tests/45-column-types.spec.js` already carries a `people` list,
so the table assertions extend rather than needing new fixtures.

By hand: paste a column copied from a spreadsheet into an open list cell and confirm it arrives as
separate items.

### Step 4 — The date picker

§4.3: `cell-date-editor.js`, its CSS, the two action registrations, and the unwrap in `closeEditor`.
Small, and last because nothing else waits on it.

Playwright cannot drive the native calendar, so the seam to test is the input: set its `value`, dispatch
`change`, and assert the cell's text was rewritten. Alongside it, that clicking the button neither
collapses the cell nor moves the caret out of it, and that `quite soon` gets no caret and no button. The
picker opening at all is the one thing to confirm by hand, with a screenshot.


---

## 7. What using it turned up

Three things, found by using the built thing rather than by reading it. All built, at `1.196.0`.

**A read-only cell said nothing until you were inside it, and then said it badly.** The expanded cell
set `cursor: text` unconditionally, so a filename or a size cell showed a caret cursor and then took
no caret. Fixed by giving the text cursor only where a caret exists, and by drawing a read-only cell's
outline dashed — the marks are in `note-table-cell.css` and the `is-readonly` class is set in
`openEditor`.

**Expanding such a cell stays.** It is how a long filepath or a long load error is read, which is what
`info_columns` wanted from the start. The cell stops looking like an editor; it does not stop opening.

**`isPropertyEditable()` in `property-type.js`** now owns the per-column half of §5.2, because the
header's lock and the cell's caret have to be one decision. Every column it says no to wears
`#icon-lock`, so the rule is trustworthy in the other direction too: no lock, you can type in it. The
lock cost `lastModified` 20px of heading, which the schema's width follows — the third time that
column has widened for a glyph, and the comment there says so.

**List items are marked with a CSS custom highlight**, `ui-functions-highlight/list-highlight.js`,
which is what lets a comma read as structure without changing a character of the text. It was the only
option that survives editing: ranges paint inside a `contenteditable` and touch no DOM, where a span
per item would be mangled by the first keystroke. It also lays nothing out — 960 ranges over 240 cells
cost zero layouts and zero style recalculations, measured, which settles the question left commented
in `highlight.css`.

**One trap, caught by a test rather than by review.** Skipping the rebuild for keystrokes that cannot
change the structure is wrong: type a comma and the new item is empty, so no range covers it, and
every ordinary letter typed to fill it lands outside every range. Any character can start an item, so
every input rebuilds — which the measurement says is affordable.
