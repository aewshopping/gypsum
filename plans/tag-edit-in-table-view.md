# Plan: tag edit in table view

Status: **not started**
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
pasting into a `tags` cell; undo; the bullet on front matter pills everywhere a pill is drawn.

**Out of scope:** writing a body `#tag` from the table (adding, removing or renaming one), moving a
tag between body and front matter, "rename column" / "delete column" on `tags` (it stays out of
`isPropertyUserOwned()`), making the `tags` *type* settable (it stays the app's: list, search exact
match), and the note picker for tags (see §6, open question 4).

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
note wrote them (strings via `String()`, nulls dropped, untrimmed text kept so a no-op edit is a
no-op), `[]` when the note has no `tags:` key. Built in `getFileDataAndMetadata()` from
`yamlData.tags` *before* the existing merge and delete, which stay as they are — the TagMap remains
the one thing filters, search, the tag panel and the taxonomy read.

- Always present (`[]`), for the same reason `internalLink` is: properties are registered from
  `myFiles[0]`.
- In `CORE_FILE_PROPERTIES` (every file carries it), in `TABLE_VIEW_COLUMNS.hidden_always` (it is
  a carrier for the tags column, not a column of its own), and in `RESERVED_KEYS` so a note's own
  `frontMatterTags:` key cannot shadow it.

Rejected alternative: flags on the TagMap entries (`inFrontMatter: true`). It answers "draw a
bullet" but not "what text does the cell open with" — the spelling and order are already gone by
then — and it would put a second fact on a structure every view reads.

### 3.2 The bullet

`renderTags()` gains an optional argument (an options flag, following its existing positional
style — `fromFrontMatter = false`). When true the pill's content becomes
`${tagnamehash}${tagcounter}&nbsp;•` — the bullet *inside* the span, after any count, so the pill
remains one element, one `data-action`, one filter target. `data-tag` is unchanged, so filtering,
copying (`cell-range-copy.js`) and anything else reading `data-tag` see the bare name.

A tag is drawn with the bullet when its lowercased, trimmed name is in the note's
`frontMatterTags` (lowercased, trimmed) — **including a tag that is also in the body** (see §6,
open question 1). Callers that draw a note's tags (`render-file-list-grid.js`, `-peek.js`,
`-search.js`, `render-value.js`, `render-cell-value.js`) pass the flag; callers that draw a tag
without a note (the tag panel, filter chips, counts) do not, and stay unchanged.

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
tags once onto a data attribute (e.g. `data-body-tags="#idea #later"`) and a rule in
`note-table-cell.css` draws them in a pseudo-element of the opened cell, faded, labelled as
coming from the note's text. Nothing in JS reads it back.

So the closed cell shows pills (body tags plain, front matter tags with a bullet), and opening it
swaps to the editable text the way any cell with markup does. This needs the cell's opened text to
come from `frontMatterTags` rather than from flattening the pills (flattening would give
`work • idea` — every tag, plus bullets). Concretely: the renderer stashes the editable text on the
cell (it already stashes `data-opened-text` at open; the tags cell needs its source text available
to `openEditor()` — a `data-edit-text` attribute or a lookup of the row's file object), and
`cell-editor.js` sets `textContent` to it in place of its usual self-assignment flatten. One branch,
keyed on the column, in the module that already owns what the caret gets.

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

**Items are written as typed.** The TagMap lowercases on read; the writer must not lowercase on
write — the note's own spelling is the user's (CLAUDE.md: *quote defensively, do not validate
strictly*). Typing a leading `#` is the one normalisation worth considering (§6, open question 3).

**A note whose front matter did not read cleanly stays locked** — the existing `yamlError` check in
`cell-editor.js` already covers it; nothing new.

### 3.5 Mismatch

`typeMismatch()` for `tags` must ask of `frontMatterTags` (always an array) rather than of the
TagMap, or it would find a Map in a list column. A scalar `tags: work` in the note is read as a
one-item list today by the merge (`Array.isArray(...) ? ... : [yamlData.tags]`); `frontMatterTags`
does the same, and committing writes it back as a list in the note's style — call that out in the
tests rather than treating it as a shape mismatch, since the app has always read it as a list.

### 3.6 Paste, copy, range

- **Paste:** `isPasteable()` follows `writesFrontMatter`, so a `tags` cell stops counting as locked.
  The pasted text is the cell's new front matter list; body tags are untouched. Covered by the
  existing journalled two-pass write and one undo.
- **Copy:** unchanged — still every pill's `data-tag`, body and front matter alike, comma-joined.
  That means copy then paste into another tags cell turns body tags into front matter tags in the
  target. Accepted: it is what was asked for, and undo puts it back. (Open question 2.)
- **Copy column…:** `tags` as a target stays refused by `copyTargetProblem()` (app-owned, not
  `title`/`color`) unless decided otherwise — out of scope here.

---

## 4. Steps

1. **`frontMatterTags` on the file object** — `file-info.js`, `store.js` (`CORE_FILE_PROPERTIES`,
   `hidden_always`), `RESERVED_KEYS`. Level 1 test: what it holds for flow, block, scalar, bare,
   null-item and absent `tags:`; that the TagMap is unchanged.
2. **The bullet** — `renderTags()` flag, and each note-drawing caller. Level 2 test: a front matter
   tag's pill ends `&nbsp;•` inside the same element; a body tag's does not; `data-tag` is the bare
   name; a tag filter from a bulleted pill still filters.
3. **Unlock** — `tags` into `WRITABLE_CORE_PROPERTIES`; `typeMismatch()` reads `frontMatterTags`;
   `cell-editor.js` opens a tags cell with the front matter list as its text; body tags on a data
   attribute drawn by CSS.
4. **Write** — no new writer; level 1 tests in `tests/1-data/49-table-cell-writing.spec.js` (or the
   spec covering list cells): edit one item, add, remove, reorder, clear (key removed, body tags
   intact), append to a note with no `tags:`, a note with no front matter, a note whose front matter
   did not read (refused), a body tag never written into front matter, typed case preserved, undo.
5. **Paste** — level 1 test that a paste into a tags cell writes front matter only and one undo
   reverts it.
6. **Docs** — CLAUDE.md: *What a table cell may contain* (the `tags` exception to "three renderers
   that mean their markup belong to columns that refuse a caret" no longer holds — `renderTags` now
   belongs to an editable column, and the open cell's text is replaced rather than flattened),
   *A locked column's type is locked* / `WRITABLE_CORE_PROPERTIES` paragraph (`tags` joins `title`
   and `color`), and the *Adding a new file property* list if `frontMatterTags` changes it.
   `DATA-STRUCTURES.md`: the new property.
7. Bump the minor version in `manifest.json`.

---

## 5. Risks

- **Body tags written into front matter.** The single biggest trap: any path that opens the cell by
  flattening the pills writes every tag, plus bullets, into `tags:`. Guarded by §3.3 (the opened
  text is `frontMatterTags`, body tags live in a pseudo-element) and by a level 1 test.
- **The bullet leaking.** Into the clipboard (guarded: copy reads `data-tag`), into a filter key
  (guarded: `data-filterkey` is built from the name), into the written value (guarded: the opened
  text never contains pills).
- **Width.** `&nbsp;•` adds about 1em per front matter pill; the tags column auto-sizes to its
  widest item, so check the fit after step 2.

---

## 6. Open questions

1. **A tag in both body and front matter** — bullet or not? Proposed: bullet, because removing it
   from the cell removes it from front matter (the pill then stays, plain). The alternative — no
   bullet, because the cell cannot make it disappear — hides that the cell can change it.
2. **Copy/paste between tags cells** turns body tags into front matter tags in the target. Accept,
   or copy only front matter tags from a tags cell?
3. **A typed `#`** — `#work` in a tags cell: write it as typed (it then reads as the tag `#work`,
   quoted because of the `#`), or strip a single leading `#`? Proposed: strip, since no one means a
   tag whose name starts with a hash.
4. **Completion** — CLAUDE.md already names the seam ("for a tags cell it would be the item the
   caret is in") in `handleCellAutocomplete`. Offer existing tag names while typing? Proposed as a
   follow-up, not part of this plan.
5. **`#parent/child` in front matter** — today a front matter `a/b` is stored as the tag `a/b` with
   no parent, unlike the body's two-level tags. Unchanged by this plan; worth a decision before
   people start typing hierarchies into cells.
