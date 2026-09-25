# Plan: a bare key is a null value, not a missing one

Status: **not started.** One question is open — §4 — and needs deciding before step 3. §5, the
tinted cell, does not wait on it.
Manifest version: bump the minor version with each step that changes code.

## 1. The problem

`people:` with nothing after the colon is, by the YAML spec, the key `people` holding **null** —
the same value as `people: null` or `people: ~`. Obsidian agrees: it shows the property with an
empty box, and clearing a property's value there writes exactly `people:`.

Gypsum's parser disagrees. It reads `people:` as the start of a nested map, finds nothing under it,
and `pruneEmptyMaps()` in `yaml-parse.js` removes it, so **the key is absent from the file object**.
Three things follow, and all three are workarounds rather than design:

- **A column delete reads every loaded note**, not just the ones with the key, because appState
  cannot say which notes hold a bare key (`plans/table-delete-column.md` §5.2). With 1,000 notes
  loaded and 20 carrying `people`, that is 1,000 reads to find 20.
- **The delete's confirmation undercounts.** It counts from appState, which cannot see bare keys, so
  the result line can read higher than the dialog did.
- **`people:` and `people: null` disagree today.** The explicit null is kept (`Object.hasOwn` is true,
  the value is null); the bare key vanishes. Two spellings of one YAML value load differently.

## 2. The change

**The parser keeps an empty value as `null`**, at every level: a key with nothing after its colon and
nothing nested under it resolves to `null` instead of being pruned. Nothing is written to any note —
`people:` is already correct YAML and stays as the note has it.

What that gives:

- **The delete's first pass reads only the notes that carry the key** — `Object.hasOwn(file, property)`
  now sees bare keys. The "every loaded file is planned" rule and its reason are retired.
- **The dialog and the result line count the same notes.**
- **`people:` and `people: null` load the same**, which is what YAML says they are.
- **Cells, sorting and type checks need nothing new.** A null already draws as a blank cell and sorts
  and type-checks as missing (`readValue` keeps null "blank on purpose").
- **A bare reserved key is caught.** `filename:` currently vanishes before the `RESERVED_KEYS` check
  sees it; now it is flagged as shadowing like any other.
- **Undo is unchanged.** A removed bare key's record is still `before: ''`, `existed: true`, and undo
  still puts it back bare with `keepKey`.

## 3. Side effects to handle

- **A bare key registers a column.** A folder where `people` only ever appears bare gains a `people`
  column it does not show today. That is correct — the notes carry the property — but it is visible.
- **`tags:` bare.** `file-info.js` already skips a null tag and deletes the key, so nothing changes;
  the CLAUDE.md sentence "the parser emits no key at all for it" becomes "it is null, which the tag
  merge skips".
- **"Empty" needs splitting into two questions.** `dead` (the faded header) and `missing` both ask
  `Object.hasOwn`. With bare keys kept, a column whose every note says `people:` is carried but holds
  no value. Today's rule treats carried as not-empty, which already happens for explicit
  `people: null`. How this resolves depends on §4.
- **Parser tests.** The level-1 expectations for bare keys and empty maps in
  `44-yaml-parser.spec.js` change; `54-delete-property.spec.js`'s `bare.md` then also checks the
  dialog's count.

## 4. Open question: what clearing a cell writes

Today **clearing a cell takes the key out, line and all** (CLAUDE.md, *Writing a cell edit back to the
note*). With bare keys read as null, there are two coherent answers.

### A. Keep it: clearing removes the key

- **Pros:**
  - No change to the writer, the undo records, the anchors or their tests.
  - Notes stay tidy: a key nobody wants does not linger as `people:`.
  - "Empty column" keeps meaning what it means now: once every value is cleared, no note carries
    the key, the header fades, and "remove from layout" is offered.
  - Bare keys only arrive from outside (Obsidian, a template, typing by hand), so they stay rare.
- **Cons:**
  - Differs from Obsidian, where clearing a value leaves `people:`. A note cleared in gypsum loses
    the property; the same note cleared in Obsidian keeps it.
  - A blank cell can mean two things, no key or a bare key — unless §5 is built, which is what it is
    for.
  - A column of bare keys reads as carried, so it offers "delete column", not "remove from layout".
    That is right (the notes do have the key) but it is a second kind of blank column.

### B. Change it: clearing leaves a bare key

- **Pros:**
  - Matches YAML and Obsidian: the property is still there, now empty.
  - The splice is smaller: only the value goes, the key line stays.
  - A cleared cell is exactly a bare key, so a blank cell has one meaning after a gypsum edit.
- **Cons:**
  - Reverses a deliberate design and the machinery built on it: `toYamlText`'s `''` "remove the key"
    answer, the anchor records, and the tests that hold both.
  - There is no longer a way to remove one key from one note in the table. That would need a new
    action (a per-cell "remove property"), or the note editor.
  - Keys accumulate: every property ever cleared stays in the note as `people:`.
  - A column never goes empty by clearing, so the faded header and "remove from layout" are only
    reached by "delete column". `dead` would have to change to mean "no non-null value" for the
    fade, while "carried" (any key, null or not) decides which delete item the menu offers.

### Recommendation

**A.** The parser change fixes how gypsum *reads* a bare key; it does not need to change what gypsum
*writes*. A keeps the writer, undo and the empty-column rules as they are, and bare keys stay the
outsider they are today, now read correctly. B is worth revisiting only if matching Obsidian's
clear-a-value behaviour becomes a goal in its own right, and it would want its own plan and the
per-cell "remove property" action decided alongside it.

Either way, **§3's split of "empty"** should be settled once. My suggestion under A is that the fade
means **"no note has a non-null value"**, and the menu's delete item keys off **"some note carries the
key"**. Then a column of bare keys fades like an empty one and offers "delete column", which is the
tool that will actually remove those keys.

## 5. Showing a key with no value

**Decided: a cell whose note carries the key but shows nothing gets a very faint tint** — the
background mixed 2% `--colour-contr` into `--colour-neutral`. A blank cell then says which blank it
is: plain for "this note has no such key", tinted for "this note has the key, empty". Nothing else
about the cell changes: no text, no icon, no tooltip it did not already have.

**It can be built as soon as step 1 lands.** The parser change is what puts the key on the file object;
from there the renderer only has to ask. It does not wait on §4 — under A it marks the bare keys that
arrive from Obsidian or a template, under B it would also mark every cell cleared in gypsum.

- **What counts as "key, no value"**: the key is on the file object and the cell draws blank — `null`
  (bare `people:` or `people: null`), `""`, and an empty list `[]`. One rule for all three, because
  what the tint answers is "the note has this property and nothing is in it", and all three are that.
  A `0` or `false` is a value and draws as one, so it is not tinted.
- **One answer, in `services/property-type.js`**, beside the other per-cell questions — e.g.
  `holdsNoValue(file, property)` — so the renderer asks rather than works it out
  (CLAUDE.md: renderers hold no logic). The row renderer writes a `data-no-value` attribute on the
  cell, and one rule in `note-table-cell.css` draws it.
- **An overlay, not a background colour.** Rows are coloured through `attr(data-color)` on the row,
  with hover, suppressed and transparent branches (`note-table.css`); a solid background on the cell
  would paint over all of that. So the tint is a `background-image` of one flat colour —
  `linear-gradient(var(--cell-no-value-tint), var(--cell-no-value-tint))` with the tint defined as
  `color-mix(in srgb, var(--colour-contr) 2%, transparent)`. On an uncoloured row that comes out as
  exactly 2% contrast into neutral; on a coloured row it darkens (or, in the dark theme, lightens)
  the row's own colour by the same small step, rather than replacing it.
- **An opened cell drops it.** An expanded cell already swaps to the neutral background, and while
  someone is typing in it the cell is no longer empty in any sense worth marking.
- **2% is a starting point.** It is at the edge of visible on some screens. The value lives in one
  custom property so it can be tuned from screenshots — light and dark theme, a coloured row and a
  plain one — without touching anything else.
- **Core columns never tint.** `CORE_FILE_PROPERTIES` are on every file object whatever the note says,
  so "has the key" means nothing for them; `title` and `color` included, since a missing `color:` is
  the app's `null`, not the note's.
- **Test**: level 2, that a bare-key cell carries `data-no-value` and a no-key cell does not; the look
  itself is a level-3 screenshot, per CLAUDE.md.

## 6. Steps

1. **Parser.** Empty values resolve to `null` at every level instead of being pruned. Level-1 parser
   tests updated. `people:` and `people: null` give the same file object.
2. **The tint (§5).** `holdsNoValue()`, `data-no-value` on the cell, the overlay rule. Screenshots in
   both themes, on a coloured and a plain row.
3. **Emptiness.** Settle §4, then split `dead` from "carried" in `render-table-columns-helper.js` as
   decided. Level-2: a column of bare keys fades and offers "delete column".
4. **The delete.** The first pass plans only the notes that carry the key; the "every loaded file is
   planned" paragraph leaves CLAUDE.md and `plans/table-delete-column.md` §5.2 gains a pointer here.
   Level-1: `bare.md` is in the dialog's count, and a note without the key is not read by the first pass.
5. **Docs.** CLAUDE.md's bare `tags:` sentence, and a line under *What a table cell may contain* for the
   tint; DATA-STRUCTURES.md, "How a front matter value is read", gains the rule that an empty value is
   null.
