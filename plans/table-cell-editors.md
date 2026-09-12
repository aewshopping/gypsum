# Plan: what opening a table cell gives you

Status: **not built**, beyond what §1 lists as already there.
Branch: `claude/table-cell-date-editor-h2at27`
Manifest version now: `1.194.0` → bump the minor version with each step that changes code.
Depends on: `plans/completed/table-value-types.md`, **built**.
Paired with: `plans/table-cell-writing.md`, which takes what comes out of here and puts it in the
note. **This plan comes first**: it decides the shape of what the writing side receives.

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
  <button class="cell-date-pick" data-action="cell-date-pick" tabindex="-1" aria-label="pick a date">
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
| `public/js/ui/ui-functions-click/cell-editor.js` | **new** | what does opening this cell give you: `openEditor` / `closeEditor`, switching on the column's type |
| `public/js/services/file-parsing/flow-list.js` | **new** | both directions of "a list as one line of text": `splitFlowItems(text)` and `joinFlowItems(items)` |
| `public/js/services/file-parsing/yaml-parse.js` | edit | one word: `export` on `flowItemRanges` |
| `public/js/ui/ui-functions-click/cell-date-editor.js` | **new** | builds the date editor, handles the pick click and the input's change |
| `public/js/ui/ui-functions-click/cell-expand.js` | edit | ask that module rather than always setting `contenteditable` |
| `public/js/ui/ui-functions-table/render-table-rows.js` | edit | §4.2's three changes, and §3's comma-joined list |
| `public/js/ui/event-listeners-add.js` | edit | `cell-date-pick` in the click map, `cell-date-set` in the change map, the button in the existing `mousedown` preventDefault |
| `public/css/cell-date-editor.css` | **new** | a new component gets its own file; register it in `public/style.css` |
| `public/css/note-table.css` | edit | delete `.table-view-array-list`; any styling the expanded cell itself needs, beside the mismatch styling already there |

**Export the scanner rather than moving it.** One definition either way, and exporting is one word
against a working parser. `flow-list.js` imports it and adds the two string helpers; the parser keeps
using it for its spans. A second comma scanner written for the UI is exactly the drift the parser's own
comment warns about — "one scanner serves both the values and their spans, so the two cannot disagree".

**`closeEditor` is the half that is easy to forget.** `collapse()` today removes `contenteditable` and the
mismatch note. A date cell also has to be unwrapped — set the cell's text back to the read-out value,
which drops the span, the button and the input in one line. It switches on the marker in the cell rather
than re-deriving the type, matching the note the renderer already leaves for `cell-expand.js`: it reads
the cell, not the schema. Only the date branch flattens; a tags cell holds real HTML. A list cell needs
nothing — §3 leaves it holding plain text.

---

## 6. Steps

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
