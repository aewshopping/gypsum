# Plan: tag edit in table view

Status: **built** — see CLAUDE.md, *The tags cell*. **As built, the marking was turned round:**
front matter tags are plain and a tag only the note's text holds is drawn `#idea`, in the table
alone — every other view draws plain pills. A solid `&nbsp;•` on front matter tags (below) and then
a hollow `◦` were tried first and read as too heavy. The `#` is full size — 90% and 70% were
compared — so it is `renderTags()`'s existing `showhash`, with no span or CSS of its own.
Related: `plans/completed/table-cell-editors.md`, `plans/completed/table-cell-writing.md`,
`plans/completed/table-range-paste.md`

---

## 1. What this delivers

The `tags` column in table view takes a caret, and what is typed there is written back to the
note — the way any other list cell is written today.

A note gets its tags from two places, and only one of them can be edited from a cell:

| Kind | Written as | Editable from the table |
|------|------------|-------------------------|
| **Body tag** | `#tag` (or `#parent/child`) anywhere in the note's prose | No — it lives in the prose, and the table never writes prose |
| **Front matter tag** | an item of the `tags:` key's list in the `---` block | **Yes** — it is a front matter value, and a cell edit splices front matter |

**A front matter tag is drawn differently**: its pill reads the tag name followed by a
non-breaking space and a bullet — `work&nbsp;•` — with the bullet inside the same tag element, so
the pill stays one clickable filter. A body tag's pill is unchanged. That is what tells someone,
before they open the cell, which of its tags the cell can change.

**In scope:** editing, adding, removing and reordering front matter tags from a `tags` cell;
pasting into a `tags` cell; undo; the bullet on front matter pills everywhere a pill is drawn;
completing existing tag names while typing in a `tags` cell.

**Out of scope:** writing a body `#tag` from the table (adding, removing or renaming one), moving a
tag between body and front matter, "rename column" / "delete column" on `tags` (it stays out of
`isPropertyUserOwned()`), making the `tags` *type* settable (it stays the app's: list, search exact
match), and parent/child tags in front matter (see §3.7).

---

## 2. Current state — facts the design depends on

### 2.1 The two kinds of tag are merged into one Map, and the seam is lost

`getFileDataAndMetadata()` (`services/file-parsing/file-info.js`) builds `tagData.tagMap`
(`Map<lowercaseTag, {count, parents}>`) from the body scan, then merges each item of
`yamlData.tags` in **only if the body did not already have it**, lowercased and trimmed, then
`delete yamlData.tags`.

Consequences:

- Once loaded, nothing on the file object says whether a tag came from the body or front matter.
- A tag in **both** places is indistinguishable from a body-only tag.
- The note's own spelling of a front matter tag (`Work`, ` draft `) is gone — the Map holds `work`.
- The item order of the front matter list is lost behind the body tags that come first in the Map.

All four matter to an editor: the cell must show the note's own text (CLAUDE.md, *What a table cell
may contain*), and that text is the front matter list, as written, in its order.

### 2.2 `tags` is locked by being a core property

`tags` is in `CORE_FILE_PROPERTIES` (`store.js`), so `isTypeSettable('tags')` is false and so are
`writesFrontMatter()` and `isPropertyEditable()` (`services/property-type.js`). That is the only
thing refusing the caret: `WRITABLE_CORE_PROPERTIES` (`['title', 'color']`) is the existing
mechanism for "the app owns the type, but the note has a place for a typed value", and `tags` fits
that description exactly — the place is the `tags:` key.

### 2.3 The renderers

- `renderTags()` (`ui-functions-render/render-tags.js`) draws one pill: a `<span class="tag
  tag-pill" data-tag=… data-action="tag-filter" …>name</span>`. It is used by the grid, peek and
  search views, by `render-value.js`, and by `render-cell-value.js` for the table.
- In the table, the `ARRAY` branch of `renderCellValue()` draws `value instanceof Map` as pills.
  A mismatched cell draws a Map as its comma-joined keys.
- `cell-range-copy.js` copies a tags cell from each pill's `data-tag`, comma-joined — **not** from
  `textContent`. So a bullet inside the pill does not reach the clipboard, and must not start to.

### 2.4 The writing machinery already handles a list key

`applyCellEdits()` → `toRawEdits()` → `applyRawEdits()` already writes a list cell into its key:
one item's text changed is a one-item splice (`list-item-splice.js`), anything else rewrites the
value in the note's own style (flow or block, its indentation, its quoting), clearing the cell
removes the key, a missing key is appended to the block. `title` and `color` prove a core property
can be routed through it. Nothing in `editing/` needs to learn a new shape.

---

## 3. Design

### 3.1 Keep the front matter tags, as the note wrote them

Add one property to the file object: **`frontMatterTags`** — an array of the `tags:` items as the
note wrote them (strings via `String()`, nulls dropped), `[]` when the note has no `tags:` key. Built
in `getFileDataAndMetadata()` from `yamlData.tags` *before* the existing merge and delete, which stay
as they are — the TagMap remains the one thing filters, search, the tag panel and the taxonomy read.
Kept as written, not lowercased or reordered, because it is what the opened cell shows and a cell
shows the note's own text. (The parser already trims an unquoted item; whitespace inside quotes is
the note's.)

- Always present (`[]`), for the same reason `internalLink` is: properties are registered from
  `myFiles[0]`.
- In `CORE_FILE_PROPERTIES` (every file carries it), in `TABLE_VIEW_COLUMNS.hidden_always` (it is a
  carrier for the tags column, not a column of its own), and in `RESERVED_KEYS` so a note's own
  `frontMatterTags:` key cannot shadow it. Note what `RESERVED_KEYS` costs, as it already does for
  the other names there: `plan-file-edits.js` refuses to write into a note carrying a reserved key,
  so a note with its own `frontMatterTags:` is locked for every column, not just shadowed.
- **Decided: hidden everywhere, not only from the table.** `hidden_always` keeps it out of the
  columns and `property-options.js`, but not out of the sort modal (`propertiesInFiles()`), the
  search property list, or "search everything" (`a-search-every-property.js` reads
  `myFilesProperties` less the user's exclusions — it would match every front matter tag twice).
  Each of those excludes it too. Check `internalLinkText`'s treatment first; if those places
  already have a rule for hidden carriers, join it rather than adding a second.

**Nothing records which tags are in the body only, and nothing needs to.** Both questions the
renderer asks are answered from `frontMatterTags` and the TagMap: a pill gets a bullet when its name
is in `frontMatterTags` (lowercased, trimmed), and the body tags shown in an opened cell are the
TagMap keys that are not. A tag written in both places is therefore treated as a front matter tag —
see §3.2. A second property recording "front matter only" was considered and dropped: it existed
only to treat that case differently, and cost a property to hide and a test.

Rejected alternative: flags on the TagMap entries (`inFrontMatter: true`). It answers "draw a
bullet" but not "what text does the cell open with" — the spelling and order are already gone by
then — and it would put a second fact on a structure every view reads.

### 3.2 The bullet

`renderTags()` gains an optional argument (an options flag, following its existing positional
style — `fromFrontMatter = false`). When true the pill's content becomes
`${tagnamehash}${tagcounter}&nbsp;•` — the bullet *inside* the span, after any count, so the pill
remains one element, one `data-action`, one filter target. `data-tag` is unchanged, so filtering,
copying (`cell-range-copy.js`) and anything else reading `data-tag` see the bare name.

A tag is drawn with the bullet when its lowercased, trimmed name is in the note's `frontMatterTags`
(lowercased, trimmed) — **whether or not the body also has it**. The table edits front matter, so
the bullet marks what the front matter holds, which is what someone editing the cell expects. The
one surprise is a tag in both places: removing it from the cell takes the bullet off and leaves the
pill, because the body's `#tag` remains. **Decided: accepted** — it is the honest picture after the
edit (the tag is now a body tag only), and the case is rare.
Callers that draw a note's tags (`render-file-list-grid.js`, `-peek.js`, `-list.js`,
`-search.js`, `render-value.js`, `render-cell-value.js`) pass the flag; callers that draw a tag
without a note (the tag panel, filter chips, counts) do not, and stay unchanged.

**Escape the tag name.** `renderTags()` interpolates `tagname` raw into `data-tag`,
`data-filterkey`, `data-tip` and the pill's text. A body tag is `\w+` so it never mattered, but a
front matter tag can hold anything, and once it can be typed into a cell a `"` or `<` would break the
pill or put markup on the page. Escape it with `escape-html.js` in all four places — CLAUDE.md's
rule is to escape everything that came from a file. Part of this step, and covered by its test.

The bullet's colour/weight can be styled with a small span inside the pill if wanted, but it must
remain inside the pill element and outside `data-tag`. No new CSS file is needed unless it is
styled; if it is, a rule beside the existing tag-pill rules.

### 3.3 Opening the cell

`tags` joins `WRITABLE_CORE_PROPERTIES`. That alone makes `writesFrontMatter('tags')` and
`isPropertyEditable('tags')` true, routes the commit through `applyCellEdits`, makes the cell
pasteable, and offers the list editor's item highlights — `tags` is already `array` in
`FILE_PROPERTIES`. `isTypeSettable('tags')` stays false: the padlock stays on the glyph, as it does
for `title` and `color`, and the header tooltip ("set by the app") is already worded for that case.

**What the open cell contains is the front matter list and nothing else**: `joinFlowItems(
frontMatterTags)`, as escaped text. Body tags cannot be in the editable text — `contenteditable`
reaches every descendant, and `cell-edit-commit.js` writes the cell's whole `textContent` into the
note, so a body tag inside the cell would be written into front matter on the first commit. They
are shown instead **by CSS**, the same way the mismatch sentence is: the renderer writes the body
tags — the TagMap keys not in `frontMatterTags` (§3.1) — once onto a data attribute (e.g.
`data-body-tags="#idea #later"`) and a rule in
`note-table-cell.css` draws them in a pseudo-element of the opened cell, faded — the `#tags`
alone, no label. **As built:** a label ("in the note's text:") was tried and dropped as too wordy;
a drop-in animation from the pills' row was then tried and taken out — it did not read as intended
and risked a layout shift as the cell closed. The line simply appears.

**As built, two more:** a press on a pill does not focus or select its cell (its `mousedown` is
cancelled, unless another cell is open, whose edit is written by focus leaving it); and a selected
tags cell gives no right edge back — the ellipsis hid the last pill while it stayed pressable. Nothing in JS reads it back. **Decided** over the alternatives —
body pills kept beside an inner editable span (as the date editor does), a "+2 in the note's text"
count, or showing nothing: the span needed the commit, the opened-text check, Escape, the list
highlights and the picker all retargeted, on the write path; this is an attribute and one rule.

**It does not clash with the mismatch sentence**, although both want the opened cell's `::after`
(`.is-expanded[data-tip]::after`). The only tags cell that can carry `data-tip` is one whose front
matter did not read — a tags cell never has a shape mismatch (§3.5) — and that cell is locked:
`openEditor()` returns before the flatten, so it keeps its pills and every tag is already on screen.
So the body-tags rule applies only to an opened cell that took a caret
(`:not(.is-readonly)`), and the two never meet on one cell.

**Take a screenshot when this is built** — a tags cell opened with front matter and body tags both,
on a coloured row, and one with only body tags — and show it to the user so the design can be
judged before moving on. The faded line's wording, placement and weight are their call from it.

So the closed cell shows pills (body tags plain, front matter tags with a bullet), and opening it
swaps to the editable text the way any cell with markup does. This needs the cell's opened text to
come from `frontMatterTags` rather than from flattening the pills (flattening would give
`work • idea` — every tag, plus bullets). Concretely: the renderer stashes the editable text on the
cell (it already stashes `data-opened-text` at open; the tags cell needs its source text available
to `openEditor()` — a `data-edit-text` attribute or a lookup of the row's file object), and
`cell-editor.js` sets `textContent` to it in place of its usual self-assignment flatten. One branch,
keyed on the column, in the module that already owns what the caret gets.

**Pressing a pill still filters at once, even in a tags cell that can now be opened. Decided:
kept.** A cell full of pills therefore has no free space to press, and so cannot be selected or
opened with the mouse — the selected cell's right-edge strip only exists once it is selected. It is
opened from the keyboard: arrow to it, then Enter. Making a pill's first press select its cell, as a
link does, was considered and rejected to keep filtering from the table one press. The CLAUDE.md
paragraph on the asymmetry keeps its rule but loses its first reason ("a pill never fills its
cell"), which this plan makes false; step 6 rewords it.

**Editing a tag under a tag filter drops the row**, since the refresh re-runs the filter — remove
`work` while filtering by `work` and the note leaves the table. **Decided: accepted**, as it is for
every column edited under a filter on itself.

### 3.4 Committing

The commit reads the cell's text as a list (the existing array path), compares against the opened
text (unchanged rule: opened-but-not-typed writes nothing), and splices the `tags:` key through
`applyCellEdits`. Everything else is existing behaviour:

- one tag's text changed → only that item's bytes;
- tags added, removed or reordered → the value rewritten in the note's own style;
- the cell emptied → the `tags:` key removed, line and all (body tags untouched, so the pills that
  remain are the body's);
- no `tags:` key yet → appended to the block, or a block created at byte 0.

`refreshFileAfterSave` re-reads the file, so the TagMap, `frontMatterTags`, the bullets, the tag
panel counts and any active tag filter all come from what the file now says.

**Items are written as typed, less one leading `#`.** The TagMap lowercases on read; the writer
must not lowercase on write — the note's own spelling is the user's (CLAUDE.md: *quote defensively,
do not validate strictly*). **Decided:** a single leading `#` on an item is stripped before writing,
since no one means a tag whose name starts with a hash, and `#work` would otherwise be written
quoted and read back as the tag `#work`. This is done for the `tags` column only — a `#` in any
other list column is still the user's text — and **on the text, before `toRawEdits()` splits it**,
since that function builds both `raw` and `items` from the same text and stripping only one would
let them disagree. Doing it there also covers a paste, which shares `toRawEdits()`. **Decided:** an
item that is only `#` is empty once stripped, and is dropped like an empty item between two commas.

**Decided: in the `tags` column, spaces separate items as well as commas**, so `#one #two` — the
shape hashtags have when copied out of a note's text — is the two tags `one` and `two`, and so is
`one two`. Typed or pasted alike, since both go through `toRawEdits()`; the split happens there,
with the `#` strip, and only for `tags`. Other list columns still split at commas only — `John
Smith` is one person.

- **A quoted item is kept whole**, as it already is against a comma: `"my tag", work` is two tags.
  So the split is a tags-specific pass over the *unquoted* items `flowItemRanges()` finds, not a
  second split of `splitFlowItems()`'s output, which has already thrown the quotes away.
- **The open cell quotes an existing tag that contains a space.** A front matter tag can hold one
  (`tags: [my tag]`) though a body tag cannot. `joinFlowItems()` quotes only for commas, quotes and
  edge whitespace, so the tags cell's opened text must also quote an item with a space inside —
  otherwise opening such a note and editing any other tag would split `my tag` in two. Keyed on the
  column, beside the split.
- Order: split at spaces, then strip one leading `#` from each piece, then drop empty pieces — so
  `# one` is `one`, and a lone `#` still disappears.

**A note whose front matter did not read cleanly stays locked** — the existing `yamlError` check in
`cell-editor.js` already covers it; nothing new.

### 3.5 Mismatch

`typeMismatch()` needs no change: it already counts a Map as a list, so the TagMap in an `array`
column is never a mismatch, and a tags cell never refuses a caret for its shape.

**Decided: a scalar `tags: work` is rewritten as a list on edit.** The merge already reads it as a
one-item list (`Array.isArray(...) ? ... : [yamlData.tags]`) and `frontMatterTags` does the same,
so the cell opens with `work` and committing writes `tags: [work, idea]` (or a block list) in place
of the scalar. This is the one column where an edit changes a value's shape without being refused —
everywhere else that is what `mismatchRefusesCaret()` stops. It is accepted because the app has
always read `tags:` as a list, and the shape rule exists to stop a write the user did not expect;
here the list is what they see. Say so in CLAUDE.md beside the `mismatchRefusesCaret()` paragraph,
and hold it with a level 1 test.

### 3.6 Paste, copy, range

- **Paste:** `isPasteable()` follows `writesFrontMatter`, so a `tags` cell stops counting as locked.
  The pasted text is the cell's new front matter list; body tags are untouched. Covered by the
  existing journalled two-pass write and one undo.
- **Paste's "already shows this" test must not read the pills.** `cell-range-paste.js` decides which
  cells will change with `target.text !== target.cell.textContent`, and a closed tags cell's
  `textContent` is its pills run together with their bullets (`work •idea`) — so every tags cell
  would count as changing and the confirmation would over-count. For `tags` it compares against
  `joinFlowItems(frontMatterTags)`, the text the cell would open with — from the row's file object or
  an attribute the renderer writes, whichever §3.3 settles on for the opened text. One branch, keyed
  on the column, beside copy's own `tags` branch.
- **Copy:** unchanged — still every pill's `data-tag`, body and front matter alike, comma-joined.
  So copy then paste into another tags cell turns the source's body tags into front matter tags in
  the target. **Decided: accepted** — copying gives every tag the cell shows, which is also what a
  spreadsheet should get, and undo puts a paste back. Copying only `frontMatterTags` was considered
  (copy and paste would then be exact inverses) and rejected.
- **Copy column…:** `tags` as a target stays refused by `copyTargetProblem()` (app-owned, not
  `title`/`color`) unless decided otherwise — out of scope here.

### 3.7 No parent/child in front matter

**Decided:** a front matter tag is always one flat tag. `a/b` in `tags:` is the tag `a/b`, with no
parent — which is what the merge already does, since it `set`s the name directly rather than going
through `processTag()`. Two-level tags remain a body feature (`#parent/child`). Typing `a/b` into a
cell is not refused; it writes the item `a/b`, which reads back as that flat tag. The CLAUDE.md
*Known limitations* line on two-level tags gains this. Note this differs from Obsidian, which reads
`a/b` in front matter as a nested tag exactly as it reads `#a/b` in the body.

**Potential later-stage enhancement:** read `a/b` in front matter as parent and child, the way
Obsidian does, by sending front matter items through `processTag()` instead of setting them
directly. Not part of this plan. Note that `frontMatterTags` (§3.1) keeps the note's own text, so
the cell editor and the writer would need no change for it.

### 3.8 Completing tag names

**Decided: in scope.** CLAUDE.md already names the seam: `handleCellAutocomplete` in
`autocomplete/autocomplete.js` has the detector and the list side by side, and "for a tags cell it
would be the item the caret is in", found with `itemRangesIn()`. So: for the `tags` column the
detector is the item under the caret (no `[[` needed — every item is a tag), and the list is the
folder's tag names (the keys of the app's tag registry, the one the tag panel draws), filtered by
that item's text. Choosing one replaces that item's text. The popup, keys and session are shared and
need nothing. No registry of pickers — two lines, as CLAUDE.md asks.

- **The tag list replaces the note picker in a tags cell; it is not offered beside it.**
  `cellOffersPicker()` offers the `[[` picker to any column that writes front matter and is `string`
  or `array`, so the moment §3.3 unlocks `tags` a tags cell offers note links — and a chosen
  `[[x.md]]` would be written as the tag `[[x.md]]`. So step 3 already has to turn the `[[` detector
  off for `tags`, even before this step gives it its own.
- **Decided: the list is every tag in the folder, unfiltered** — no exclusion of tags already in
  the cell or in the note's body. The upside of trimming it is not worth the code.
- **Decided: a chosen tag is written as the registry has it, lowercase.** Typing `Wo` and choosing
  writes `work`. Tags are case-insensitive everywhere in the app; text typed without choosing from
  the list keeps its own case, as §3.4 says.

---

## 4. Steps

1. **`frontMatterTags` on the file object** — `file-info.js`, `store.js` (`CORE_FILE_PROPERTIES`,
   `hidden_always`), `RESERVED_KEYS`, and kept out of the sort modal, the search property list and
   "search everything" (§3.1). Level 1 test: what it holds for flow, block, scalar, bare, null-item
   and absent `tags:`; that the TagMap is unchanged.
2. **The bullet** — `renderTags()` flag and escaping (§3.2), and each note-drawing caller. A
   front matter tag holding `"` or `<` draws as text in one intact pill. Level 2 test: a front matter
   tag's pill ends `&nbsp;•` inside the same element, including a tag the body has too; a body-only
   tag's does not; `data-tag` is the bare
   name; a tag filter from a bulleted pill still filters.
3. **Unlock** — `tags` into `WRITABLE_CORE_PROPERTIES`; the `[[` note picker turned off for
   `tags` (§3.8); `cell-editor.js` opens a tags cell with the front matter list as its text; body
   tags on a data attribute drawn by CSS, only on a cell that took a caret. **Screenshot it and
   show the user** (§3.3) before going on.
4. **Write** — no new writer; level 1 tests in `tests/1-data/49-table-cell-writing.spec.js` (or the
   spec covering list cells): edit one item, add, remove, reorder, clear (key removed, body tags
   intact), append to a note with no `tags:`, a note with no front matter, a note whose front matter
   did not read (refused), a body tag never written into front matter, typed case preserved, a
   leading `#` stripped and a lone `#` dropped, `#one #two` written as two tags, an existing
   `"my tag"` surviving an edit to another tag in the same cell, a scalar `tags: work` rewritten as
   a list, undo.
5. **Paste** — the "already shows this" comparison for `tags` (§3.6). Level 1 test that a paste
   into a tags cell writes front matter only and one undo reverts it; level 2 test that pasting a
   tags cell's own front matter text back into it counts nothing as changing.
5a. **Completion** — §3.8. Level 2 test: typing in a tags cell offers matching tag names, choosing
   one replaces the item under the caret, Escape closes the popup before the cell.
6. **Docs** — CLAUDE.md: *What a table cell may contain* (the `tags` exception to "three renderers
   that mean their markup belong to columns that refuse a caret" no longer holds — `renderTags` now
   belongs to an editable column, and the open cell's text is replaced rather than flattened),
   *A locked column's type is locked* / `WRITABLE_CORE_PROPERTIES` paragraph (`tags` joins `title`
   and `color`), the *Known limitations* two-level tags line (§3.7), the note picker section
   (a tags cell now completes tag names, instead of note links), the tag pill / link asymmetry
   paragraph (rule kept, its "a pill never fills its cell" reason replaced by "a full tags cell is
   opened from the keyboard" — §3.3), the `mismatchRefusesCaret()`
   paragraph (a scalar `tags:` is rewritten as a list — §3.5), and the *Adding a new file property*
   list if the new properties change it.
   `DATA-STRUCTURES.md`: the new property.
7. Bump the minor version in `manifest.json`.

---

## 5. Risks

- **Body tags written into front matter.** The single biggest trap: any path that opens the cell by
  flattening the pills writes every tag, plus bullets, into `tags:`. Guarded by §3.3 (the opened
  text is `frontMatterTags`, body tags live in a pseudo-element) and by a level 1 test.
- **The bullet leaking.** Into the clipboard (guarded: copy reads `data-tag`), into a filter key
  (guarded: `data-filterkey` is built from the name), into the written value (guarded: the opened
  text never contains pills), into paste's change count (guarded: §3.6 compares against
  `frontMatterTags`, not the pills' text).
- **Markup in a tag name.** Guarded by escaping in `renderTags()` (§3.2).
- **Width.** `&nbsp;•` adds about 1em per front matter pill; the tags column auto-sizes to its
  widest item, so check the fit after step 2.

---

## 6. Decisions

1. **Every tag in the `tags:` list has a bullet, even if the body has it too** — the table edits
   front matter, so the bullet marks what front matter holds. Removing such a tag in the cell takes
   the bullet off and leaves the pill (§3.2). Replaces an earlier decision that a tag in both had no
   bullet, which needed a second hidden property to tell the cases apart (§3.1).
2. **Copy/paste between tags cells may turn body tags into front matter tags** in the target —
   accepted (§3.6).
3. **A single leading `#` is stripped** from a typed item (§3.4).
4. **Completion is in scope** (§3.8), replacing the `[[` note picker in a tags cell. It lists every
   tag in the folder, unfiltered, and a chosen tag is written lowercase.
5. **No parent/child in front matter for now** — `a/b` is one flat tag. Reading it as nested, as
   Obsidian does, is noted as a potential later-stage enhancement (§3.7).
6. **A scalar `tags: work` is rewritten as a list** when its cell is edited — the one column where an
   edit changes a value's shape (§3.5).
7. **Copy gives every tag the cell shows**, body and front matter alike; copying only front matter
   tags was rejected (§3.6).
8. **An item that is only `#` is dropped** (§3.4).
9. **Body tags in an open cell are a faded line drawn by CSS** (§3.3) — chosen over keeping pills
   beside an editable span, a count, or nothing. Screenshot it when built for the user to judge.
10. **`frontMatterTags` is hidden everywhere** — columns, sort modal, search (§3.1).
11. **Spaces separate tags as well as commas**, in the `tags` column only, so `#one #two` is two tags;
    a quoted item is kept whole, and the open cell quotes an existing tag containing a space (§3.4).
12. **Paste replaces the front matter list**, as in every other column, and a tag the target note
    already has in its text is written into front matter anyway. Both considered and kept (§3.6).
14. **Tag names are escaped in `renderTags()`** — a typed front matter tag may hold any character
    (§3.2).
15. **A pill's press still filters at once**; a tags cell full of pills is opened from the keyboard
    (§3.3).
16. **Removing a tag under that tag's filter drops the row**, as editing any filtered column does
    (§3.3).
