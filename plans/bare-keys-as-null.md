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
  - A blank cell can mean two things, no key or a bare key — unless §5 is built, which tints the
    first and so tells them apart.
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

## 5. Showing a note that has no such key

**Decided: a cell whose note does not have the key at all gets a very faint tint** — the background
mixed 2% `--colour-contr` into `--colour-neutral`. Every cell whose note *does* have the key looks like
the rest of the table, whether it holds a value or is empty (`people:`). So the colour of an ordinary
cell stays the colour of the table, and the odd one out is the cell with nothing behind it in the
note. Nothing else about the cell changes: no text, no icon, no tooltip it did not already have.

**It follows step 1, and has to.** Until the parser keeps a bare key, `people:` is absent from the file
object and would be tinted as if the note had no key — the very confusion the tint exists to end. Once
step 1 lands the renderer only has to ask. It does not wait on §4.

- **What counts as "no key"**: the property is not on the file object at all. A bare `people:`,
  `people: null`, `people: ""` and `people: []` all *have* the key and are not tinted, which is the
  YAML answer: each is the property, present, holding nothing.
- **What it shows, in practice:**
  - A sparse column reads at a glance: the notes that never had the property are tinted, the ones
    that have it — filled or empty — are not.
  - A note with no front matter has every front matter cell tinted, and so does a note whose block
    does not carry that key.
  - A column no note carries (the faded header, `dead`) is tinted all the way down, which agrees with
    the header rather than adding a second signal.
  - Under §4 A, clearing a cell removes the key, so the cell turns tinted as it closes — a quiet
    confirmation that the key has gone from the note, not just its value. Under B it would stay plain,
    being a bare key.
- **One answer, in `services/property-type.js`**, beside the other per-cell questions — e.g.
  `noteLacksProperty(file, property)` — so the renderer asks rather than works it out (CLAUDE.md:
  renderers hold no logic). The row renderer writes a `data-no-key` attribute on the cell, and one
  rule in `note-table-cell.css` draws it.
- **An overlay, not a background colour.** Rows are coloured through `attr(data-color)` on the row,
  with hover, suppressed and transparent branches (`note-table.css`); a solid background on the cell
  would paint over all of that. So the tint is a `background-image` of one flat colour —
  `linear-gradient(var(--cell-no-key-tint), var(--cell-no-key-tint))` with the tint defined as
  `color-mix(in srgb, var(--colour-contr) 2%, transparent)`. On an uncoloured row that comes out as
  exactly 2% contrast into neutral; on a coloured row it shifts the row's own colour by the same
  small step, rather than replacing it.
- **An opened cell drops it.** An expanded cell already swaps to the neutral background, and a cell
  being typed into is about to have the key.
- **2% is a starting point.** It is at the edge of visible on some screens, and in a sparse table it
  will cover a lot of cells, so it should stay quiet. The value lives in one custom property so it can
  be tuned from screenshots — light and dark theme, a coloured row and a plain one, a sparse column
  and a full one — without touching anything else.
- **Core columns never tint.** `CORE_FILE_PROPERTIES` are on every file object whatever the note says,
  so "lacks the key" can never be true of them; `title` and `color` included, since a missing
  `color:` is the app's `null`, not the note's.
- **Test**: level 2, that a no-key cell carries `data-no-key` and a bare-key cell does not; the look
  itself is a level-3 screenshot, per CLAUDE.md.

## 6. Steps

1. **Parser.** Empty values resolve to `null` at every level instead of being pruned. Level-1 parser
   tests updated. `people:` and `people: null` give the same file object.
2. **The tint (§5).** `noteLacksProperty()`, `data-no-key` on the cell, the overlay rule. Screenshots
   in both themes, on a coloured and a plain row.
3. **Emptiness.** Settle §4, then split `dead` from "carried" in `render-table-columns-helper.js` as
   decided. Level-2: a column of bare keys fades and offers "delete column".
4. **The delete.** The first pass plans only the notes that carry the key; the "every loaded file is
   planned" paragraph leaves CLAUDE.md and `plans/table-delete-column.md` §5.2 gains a pointer here.
   Level-1: `bare.md` is in the dialog's count, and a note without the key is not read by the first pass.
5. **Docs.** CLAUDE.md's bare `tags:` sentence, and a line under *What a table cell may contain* for the
   tint; DATA-STRUCTURES.md, "How a front matter value is read", gains the rule that an empty value is
   null.
