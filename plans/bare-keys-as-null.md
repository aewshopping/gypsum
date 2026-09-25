# Plan: a bare key is a null value, not a missing one

Status: **not started.** §4 is decided: clearing a cell still removes the key (option A).
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
- **A bare `title:` hides the note's `# H1`.** Front matter overrides the H1, so a note carrying
  `title:` (from an Obsidian template, say) shows a blank title where it showed the heading — the
  same as `title: null` does today. Not considered an issue: gypsum never writes a bare `title:`,
  and a note that says it has an empty title is taken at its word.
- **"Empty" needs splitting into two questions.** `dead` (the faded header) and `missing` both ask
  `Object.hasOwn`. With bare keys kept, a column whose every note says `people:` is carried but holds
  no value. Today's rule treats carried as not-empty, which already happens for explicit
  `people: null`. §4 settles it.
- **Parser tests.** The level-1 expectations for bare keys and empty maps in
  `44-yaml-parser.spec.js` change; `54-delete-property.spec.js`'s `bare.md` then also checks the
  dialog's count.

## 4. Decided: what clearing a cell writes

Today **clearing a cell takes the key out, line and all** (CLAUDE.md, *Writing a cell edit back to the
note*). With bare keys read as null, there were two coherent answers. **A is chosen.**

### A. Keep it: clearing removes the key (chosen)

- **Pros:**
  - No change to the writer, the undo records, the anchors or their tests.
  - Notes stay tidy: a key nobody wants does not linger as `people:`.
  - "Empty column" keeps meaning what it means now: once every value is cleared, no note carries
    the key, the header fades, and "remove from layout" is offered.
  - Bare keys only arrive from outside (Obsidian, a template, typing by hand), so they stay rare.
- **Cons:**
  - Differs from Obsidian, where clearing a value leaves `people:`. A note cleared in gypsum loses
    the property; the same note cleared in Obsidian keeps it.
  - A blank cell can mean two things, no key or a bare key. Accepted: most of the time a blank cell
    means the note has no such property, which is fine, and few people will care about the
    difference. Tinting the no-key cells to tell them apart was considered and dropped.
  - A column of bare keys reads as carried, so it offers "delete column", not "remove from layout".
    That is right (the notes do have the key) but it is a second kind of blank column.

### B. Change it: clearing leaves a bare key (not chosen)

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

### Decision

**A.** The parser change fixes how gypsum *reads* a bare key; it does not need to change what gypsum
*writes*. A keeps the writer, undo and the empty-column rules as they are, and bare keys stay the
outsider they are today, now read correctly. B is worth revisiting only if matching Obsidian's
clear-a-value behaviour becomes a goal in its own right, and it would want its own plan and the
per-cell "remove property" action decided alongside it.

**§3's split of "empty"** is settled with it: the fade means **"no note has a non-null value"**, and
the menu's delete item keys off **"some note carries the key"**. Then a column of bare keys fades
like an empty one and offers "delete column", which is the tool that will actually remove those keys.

## 5. Steps

1. **Parser.** Empty values resolve to `null` at every level instead of being pruned. Level-1 parser
   tests updated. `people:` and `people: null` give the same file object.
2. **Emptiness.** Split `dead` from "carried" in `render-table-columns-helper.js` as decided in §4.
   Level-2: a column of bare keys fades and offers "delete column".
3. **The delete.** The first pass plans only the notes that carry the key; the "every loaded file is
   planned" paragraph leaves CLAUDE.md and `plans/table-delete-column.md` §5.2 gains a pointer here.
   Level-1: `bare.md` is in the dialog's count, and a note without the key is not read by the first pass.
4. **Docs.** CLAUDE.md's bare `tags:` sentence, and the fade's new meaning under *An empty column*;
   DATA-STRUCTURES.md, "How a front matter value is read", gains the rule that an empty value is
   null.
