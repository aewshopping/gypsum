# Plan: formula columns in table view — a property read through a file's links

Status: **not started.** Its blocker is gone: saved layouts are built, so §1.1's "layouts first" is
satisfied and this is now buildable.
Branch: `claude/table-range-select-copy-paste-iq6tcf`
Related: `plans/completed/table-saved-layouts.md` and `plans/completed/property-type-store.md`, both
**built**; `plans/table-json-export.md`, which shares the value-shape problem
Later: writing a computed value back into the note — §10, a separate plan, not this one

---

## 1. What this delivers

A column whose value is computed per file from a short expression, rather than read from a
single property. The headline capability is following a note's internal links and reading a
property from the file — or files — they point at:

```
link(internalLink).status
```

*"Take this file's links, find the notes they name, show each of those notes' status."*

**In scope:** a small navigation language — property access, array indexing, link following —
evaluated per visible row, rendered as a table column; **mapping over a whole array of links**
(§1.3); a way to add such a column from the UI (§5g); an editor that makes the reference easy to
write.

**Explicitly out of scope:** arithmetic, comparisons, conditionals, aggregation across files,
sorting or filtering by a formula column, and writing the computed value into the note (§10).

### 1.1 A formula belongs to the layout, not to the property

Column definitions live in the saved-layout file. A formula column has no underlying file property
— it *is* a definition — so the formula is one more field on a layout's column entry:

```js
{ order: 3, name: "linkedStatus", label: "Project status", width: 200, visible: true,
  formula: "link(project).status" }
```

`name` becomes just its key and `label` its heading.

**This is deliberately not a property type.** Types now live in the `propertyTypes` object at the
top of the layouts file, keyed by property name, precisely so that two layouts cannot disagree
about what `due` holds — and a formula column has no property name to key off. An earlier draft of
this plan predated that split and is superseded here; `related` must not join `VALUE_TYPES`.

Two wrinkles in `layout-apply.js` that this has to deal with, both consequences of a layout file
being hand-editable:

- **`applyLayoutToColumnLayout()` builds a strict whitelist** — `label`, `width`, `visible` and
  nothing else, which is how a stale `type` left by a version 1 file is ignored rather than
  honoured. `formula` has to be added to it explicitly, and validated there like the others.
- **`defaultColumnEntry(name)` reads the schema for a fallback label and width**, and an invented
  column has no schema entry to fall back to. Decide what a formula column with an unusable width
  gets instead.

### 1.2 The reference property may hold one link or many

Two shapes, one rule. A single value whose text is a link yields a single value; an array of links
yields a list with one value per link, in the links' own order. That the result is a list when the
source is a list is what makes the column read naturally — four linked projects, four statuses,
lined up with each other.

### 1.3 Mapping is in, and `link()` should do it without new syntax

An earlier draft of this plan ruled out mapping over a whole link array, leaving `internalLink[0]`
as the only way to follow one. That was the wrong call, and the strongest argument against it is in
the app already: **`internalLink` is always an array** — `[]` when the file has no links, by
deliberate choice at `file-info.js:61`. So `link(internalLink[0]).title` was never "follow the
link", it was "follow the first of them and silently ignore the rest", which is a footgun dressed
as the headline example.

**The recommendation is to map implicitly rather than to add `[*]`:** when `link()` is handed an
array, it resolves each element and the rest of the chain runs against each result. The grammar
does not grow at all — `[n]` is already optional in §3.2 — so `link(internalLink)` follows all of
them and `link(internalLink[0])` still narrows to one. A new `[*]` token would buy the same
behaviour and cost a fourth grammar rule.

What it does cost, and each is a decision in §4.8:

- a list of lists when two hops both fan out, so a flattening rule is needed;
- an answer for a hole — a broken link at position 2 of 4, where dropping it silently misaligns the
  result from the links that produced it;
- the nullish short-circuit of §3.4 becomes "this slot is empty" rather than "this cell is empty".

---

## 2. Current state — what already exists

### 2.1 Link resolution is already built, cached and correct

`services/internal-links/note-name-index.js` exports `resolveNoteName(name)`, which turns raw
link text into a file's `internalId`. It handles everything the formula language would
otherwise have to:

- path-qualified links (`work/notes.md`) and bare filenames (`notes.md`)
- case-insensitive matching and surrounding whitespace
- extension-less links (`bob` → tries `bob.txt`, then `bob.md`)
- two files sharing a filename — shortest path wins, ties alphabetical, so resolution is stable

It is backed by a lazily-built cache invalidated by `invalidateNoteNameIndex()`, which the
loaders, rename, delete and create paths already call.

**`link()` is a thin wrapper over this function.** Do not write a second resolver.

### 2.2 `internalLink` holds raw link text, not resolved ids

`file-info.js:64` sets `internalLink: tagData.links`, built from `linkTarget.trim()` — the text
inside `[[...]]` exactly as written. So an element of `internalLink` yields something like
`"notes.md"` or `"bob"`, which is precisely what `resolveNoteName` expects. The two halves already
fit.

It is always an array, `[]` when the file has no links — deliberately, per the comment at
`file-info.js:61`, and the reason §1.3 exists.

A front-matter property holding a link is the other source, and it may be either shape: `project:
"[[alpha]]"` or a list of them. Whether the formula reads the raw `[[...]]` text or something that
strips the brackets is a decision in §4.8.

### 2.3 There is no `internalId → file object` lookup

Nine call sites do `appState.myFiles.find(f => f.internalId === fileId)` — fine for a click
handler, wasteful for something that runs per cell per render, and more so now that one cell may
follow several links.

`note-name-index.js`'s `build()` already iterates `appState.myFiles` and is already invalidated
in all the right places. **Add a `byId` map to that existing index** rather than introducing a
second cache with its own staleness bugs (§4.5).

### 2.4 There is no Content-Security-Policy

No CSP meta tag in `index.html`, so `new Function` would technically run. That is not a reason
to use it — see §4.2, which rejects it on stronger grounds.

### 2.5 Values are not all JSON-simple

The same trap the export plan documents (`plans/table-json-export.md` §2.2) applies here:
`tags` is a `Map`, `lastModified` is a `Date`, YAML values may be arrays or nested objects. A
formula that lands on one of these must render sensibly rather than as `[object Object]`.

---

## 3. The language

### 3.1 Syntax

Deliberately close to Obsidian Bases, minus the ceremony. Where Bases writes:

```
link(file.name).asFile().properties.status
```

this writes:

```
link(internalLink).status
```

`.asFile().properties` exists in Bases because its type system distinguishes a Link from a File
from that File's property bag. With one kind of file object and one property bag, those two
steps carry no information and are dropped.

### 3.2 Grammar — the whole of it

```
formula  := step ( '.' step )*
step     := NAME index?            property access, optionally indexed
          | 'link' '(' formula ')' follow a link, or every link in an array
index    := '[' INTEGER ']'
NAME     := [A-Za-z_][A-Za-z0-9_]*
```

That is the entire language. No operators, no literals, no comparisons, no function library
beyond `link`, and — per §1.3 — no `[*]`. Everything it can express is navigation through data
that already exists.

Examples:

| Formula | Meaning |
|---|---|
| `title` | the file's own title — a formula column can be a plain alias |
| `internalLink` | the raw text of every link |
| `internalLink[0]` | the raw text of the first link |
| `link(internalLink).title` | the title of **every** linked file, as a list |
| `link(internalLink[0]).title` | the title of the first linked file only |
| `link(project).status` | a front-matter link followed to a front-matter property |
| `link(link(internalLink).internalLink).title` | two hops, fanning out at both (§4.8) |

### 3.3 Parsing it

Two functions, roughly eighty lines together:

1. **A parens-aware split on `.`** — walk the characters tracking bracket depth, split only at
   depth zero. Fifteen lines. This is what lets `link(a.b).c` work while a naive
   `String.split('.')` would not.
2. **A per-step matcher** — each piece is either `NAME`, `NAME[n]`, or `link(...)`. Three
   regexes and a recursive call for the `link` argument.

Parsing produces a small array of step objects. It does not need a tokeniser, a Pratt parser,
or an AST beyond that array. If the implementation starts growing an expression-precedence
table, the grammar has been widened past §3.2 and should be pulled back.

**This has been prototyped.** A throwaway implementation of the splitter, the step matcher and
the evaluator came to about 35 lines before JSDoc and error handling, and produced:

```
title                                              → "Note A"
internalLink[0]                                    → "b.md"
link(internalLink[0]).title                        → "Note B"
link(internalLink[0]).status                       → "active"
link(internalLink[0]).missing                      → null      (property absent)
link(link(internalLink[0]).internalLink[0]).title  → "Note C"   (two hops)
link(internalLink[5]).title                        → null      (index out of range)
link(internalLink[0]).                             → parse error
```

So the size estimate is safe, the nullish short-circuit does cover broken links, missing
properties and bad indexes without special cases, and multi-hop chains work without extra
machinery. **The prototype predates §1.3 and did not fan out**, so it says nothing about the cost
of mapping — treat it as a sanity check on the grammar, not as code to copy.

### 3.4 Evaluating it

Walk the steps left to right carrying a current value, starting from the file object:

- `NAME` → `current[name]`
- `NAME[n]` → `current[name]?.[n]`
- `link(inner)` → evaluate `inner` against the *current* value; if the result is an array, resolve
  each element and continue against each (§1.3); otherwise resolve the single value. Resolution is
  `resolveNoteName` then the `byId` lookup (§2.3).

Any step that lands on `undefined` or `null` short-circuits: the rest of the chain is skipped and
that slot is empty. A broken link, a missing property and an out-of-range index all take this path,
which is why none of them need special cases. When the walk has fanned out, a short-circuit empties
one slot rather than the whole cell — §4.8 decides what becomes of it.

---

## 4. Design decisions

### 4.1 Formulas read stored properties only — never other formula columns

**This is the rule that removes an entire class of problem.** If a formula could reference
another formula column, file A's column could depend on file B's, which could depend back on
A's, and evaluation would need cycle detection, memoisation and a depth limit. Two notes that link
to each other are not a rare case; they are the normal case.

Forbidding it makes cycles impossible by construction: every step reads static data that was
computed at load time. Multi-hop chains stay safe because a formula's length bounds its own
depth — there is no recursion to run away.

Enforce it where the formula is evaluated: the file object a formula sees is the stored one,
which has no computed columns on it. Nothing extra is needed; the constraint is structural, and
should be documented as intentional so nobody later "improves" it by passing computed values in.

### 4.2 No `eval`, no `new Function`

Not for the usual reasons. The decisive one is specific to this app:

**Layout files are shareable data.** A `.gypsum` layout holding formula columns is exactly the
sort of thing a user would send to someone else, or copy from a forum post. If formulas are
evaluated as JavaScript, opening a shared layout file executes a stranger's code with full page
privileges — `fetch`, `localStorage`, the File System Access handles in `appState`, all of it.
That would quietly invert the app's central promise that your files stay on your computer.

An interpreter over §3.2's grammar cannot do any of that. It has no way to name a global, and no
construct that loops, so a formula also cannot hang the tab. Implicit mapping (§1.3) does not
change that: the fan-out is bounded by how many links the files actually have.

The grammar is small enough that this costs about a hundred lines. That is the whole price.

### 4.3 Evaluate per visible row, at render time

The table renders one page at a time (`checkFileOnPage`, `PAGINATION_SIZE` default 50), so a
formula column costs ~50 evaluations per render, each a handful of map lookups — times the number
of links a row follows, which is small. Nothing needs caching, precomputing or invalidating.

Do **not** evaluate at load time. That would spend the work on files nobody looks at, and would
need invalidating whenever any file changed.

### 4.4 Display-only for the first version

A formula column is not sortable and not searchable.

The reason is scope, not cost — sorting 2000 files by a formula would take a millisecond. But
sorting means teaching `file-object-sort.js` about a value that has no `FILE_PROPERTIES.type`,
and searching means threading computed values through the whole filter pipeline in
`ui-functions-search/`. Both are real features with their own edges, and neither is needed to
answer *"show me the status of the projects this note links to"*.

Say so in the UI — a formula column header should not offer the sort chevron that
`render-table-header.js:12` puts on every other column. This is the decision most likely to be
regretted: a status pulled from a linked project is a thing people will want to sort by.

### 4.5 Extend the existing index rather than adding a cache

Add `byId: Map<internalId, fileObject>` to the object `build()` returns in
`note-name-index.js`, and export a `getFileById(id)` alongside `resolveNoteName`.

That function already walks every file, is already cached, and is already invalidated by
`invalidateNoteNameIndex()` from the loaders, rename, delete and create paths. A separate map
would be a second thing to remember to invalidate — and the failure mode of a stale one is a
formula silently reading a deleted file's properties.

While there, consider whether the nine `myFiles.find(...)` call sites (§2.3) should use it too.
That is a tidy-up, not part of this feature — do it separately or not at all.

### 4.6 Rendering a computed value

A formula can land on any of the value shapes §2.5 lists, and after §1.3 it can land on a list of
them. Render by inspecting the value, since a formula column has no declared `type`:

| Value | Rendered as |
|---|---|
| string, number | as-is |
| `Date` | locale date, matching the `date` branch in `render-table-rows.js:40` |
| `Map` (i.e. `tags`) | the keys, joined — same reduction the export uses |
| array | the existing list-cell treatment: one comma-joined line, per the cell rules in CLAUDE.md |
| `null` / `undefined` | empty cell |

A fanned-out result is an array and takes that row, which is what makes the list-cell machinery —
`itemRangesIn()`, auto-sizing to the widest item — apply for free.

This is the third place in the codebase to switch on a value's shape, after the row renderer and
the exporter. Resist merging them: each produces a different output for a different consumer,
and the export plan (§3.5) already records why that duplication is the right call.

### 4.7 Errors: separate "your formula is wrong" from "this file has nothing there"

Two failures that look alike and should not be reported alike:

- **A formula that does not parse** — a typo, an unclosed paren. This is wrong for every row.
  Report it once, where the formula is being edited, and do not add the column.
- **A formula that parses but finds nothing** — a broken link, a file without that front-matter
  key, an index past the end of the array. This is normal and per-file. Render an empty cell.

Only the first is an error. Making the second one visible would put a warning icon on every row
of a folder where only some notes have the property, which is the common case.

### 4.8 Decisions the fan-out opens, still to settle

- **Flattening.** `link(link(internalLink).internalLink).title` yields a list per link. Flatten one
  level (almost certainly), flatten fully, or refuse a second fan-out.
- **Holes, and whether alignment is promised.** Four links, two of which resolve to notes with the
  property. Dropping the empties gives a tidy two-item list that no longer lines up with the links
  that produced it; keeping them gives `alpha, , , delta`. Alignment matters more the moment a
  second formula column sits beside the first.
- **Deduplication.** Two links to the same note give the same value twice. Probably keep both —
  dropping them is a judgement the formula did not ask for.
- **Bracket text.** A front-matter `project: "[[alpha]]"` reaches the formula with its brackets on.
  Decide whether `link()` strips them or `resolveNoteName` is taught to, and note that
  `internalLink` arrives already stripped (§2.2) — so the two sources do not currently agree.

### 4.9 A formula cell takes no caret

A computed value is not in the note, so there is nothing to splice an edit into. That is the
existing lock machinery: `isPropertyEditable()` is the one question, and it must answer false here.

What the header should *draw* is open: the padlock says "the app owns this", which is true of
`lastModified` in a way it is not of a column the user themselves invented. A mark of its own may
be worth it. Whatever is chosen has to exist in the column picker too, since `type-glyph.js` draws
both from one place.

---

## 5. Steps

### 5a. `public/js/services/internal-links/note-name-index.js`

Add `byId` to `build()`'s returned object and export `getFileById(id)`. Update the JSDoc on
`build()` to say what the third map is for.

### 5b. `public/js/services/formula/parse-formula.js` (new)

The parens-aware splitter and the step matcher (§3.3). Exports `parseFormula(source)` returning
either the step array or a parse error. Pure — no `appState`, no DOM. This is the piece that
most benefits from being independently readable, so keep it free of everything else.

### 5c. `public/js/services/formula/evaluate-formula.js` (new)

Exports `evaluateFormula(steps, file)` — the left-to-right walk in §3.4, with the short-circuit
on nullish and the fan-out of §1.3. Imports `resolveNoteName` and `getFileById`. No DOM.

A new `services/formula/` directory rather than loose files: two modules with one shared
concern, matching how `file-parsing/` and `internal-links/` are organised.

### 5d. Layout schema

Allow `formula` on a layout's column entry (§1.1) — adding it to the whitelist in
`applyLayoutToColumnLayout()`, and answering what `defaultColumnEntry` gives a column the schema
has never heard of. Parse each formula once when the layout is applied, not once per row per
render — store the step array alongside the column definition. A column whose formula fails to
parse is dropped with a message (§4.7).

### 5e. `public/js/ui/ui-functions-table/render-table-rows.js`

For a column carrying a formula, call the evaluator and render by value shape (§4.6) instead of
reading `file[prop.name]` and switching on `prop.type`.

### 5f. `public/js/ui/ui-functions-table/render-table-header.js`

Omit the sort trigger for formula columns (§4.4), and draw whatever §4.9 settles on.

### 5g. Adding a formula column, and editing its formula

**This is the step with the most unanswered questions, and it is worth answering them before 5a.**
Every column today comes from a property some file has; this is the first one a user invents, so
"add column" is a new verb for the app.

- **Where it is added from.** The layouts modal already lists columns and is the natural home; the
  column menu (`ui-functions-click/column-menu.js`) is where a user is already thinking about one
  column, so a shortcut there is worth having. Both were asked for — decide which one *owns*
  creation, so there is one code path and not two.
- **What happens with no layout saved.** A formula column only exists in a layout. Decide whether
  adding one forces a layout into existence, or whether it lives in `columnLayout` unsaved and
  marks it dirty like any other change.
- **What the editor actually is.** If it is two pickers — a reference property, then a property
  name to read off the far end — then the formula string is an implementation detail, and could
  just as well be two fields on the column entry. A free-text formula is only worth its parser if
  chains longer than one hop are wanted. **Decide this before 5b**, because it decides whether
  §3.3's parser is needed at all.
- **Where the parse error appears**, if there is free text to get wrong (§4.7).
- **Removing one.** A formula column with no property behind it cannot be recovered by unhiding, so
  deleting it is a real deletion rather than a visibility toggle.

The `autocomplete/` machinery could later offer property names, but that is a separate feature —
do not build it here.

Bump `manifest.json` minor version.

---

## 6. Files touched

```
public/js/services/formula/parse-formula.js      NEW  grammar → step array
public/js/services/formula/evaluate-formula.js   NEW  step array + file → value
public/js/services/internal-links/note-name-index.js   MOD  byId map + getFileById
public/js/table-layouts/layout-apply.js          MOD  formula on the column whitelist
public/js/ui/ui-functions-table/render-table-rows.js   MOD  evaluate formula columns
public/js/ui/ui-functions-table/render-table-header.js MOD  no sort trigger; the header mark
public/js/services/property-type.js              MOD  a formula column is not editable (§4.9)
(layouts modal / column menu)                    MOD  add a column, edit its formula (§5g)
manifest.json                                    MOD  minor bump
```

Nothing outside table view and the layout feature. No service gains DOM access; both new
modules are pure functions over data.

---

## 7. Verification

Run the existing suite to confirm nothing regressed: `npm install` once, then `npm test`.

Screenshots per `CLAUDE.md`: a formula column resolving a link, and the same column on a file
whose link is broken (empty cell, no error decoration).

Worth checking by hand, because they are the cases the design is built around:

- a folder where some notes link to a note that has the property and some link to one that does
  not — populated for the first group, blank for the second, nothing alarming shown for either;
- **a note with four links where only some resolve**, which is what §4.8's alignment decision has
  to be judged against — it is not obvious on paper which reading is right.

---

## 8. Deliberately not doing

| Not doing | Why |
|---|---|
| Arithmetic, comparisons, conditionals | Turns a navigation path into an expression language, which needs a real parser and precedence rules. The named use case does not want it |
| `eval` / `new Function` | Layout files are shareable; evaluating them as JS makes a shared layout executable code (§4.2) |
| Formulas referencing other formula columns | Removes cycles by construction, and two notes linking to each other is the normal case (§4.1) |
| A `related` entry in `VALUE_TYPES` | A formula column has no property name to key a type against; it is a layout column, not a type (§1.1) |
| An `[*]` token for mapping | Mapping is in, but `link()` doing it implicitly gets the same behaviour without a fourth grammar rule (§1.3) |
| Sorting or filtering by a formula column | Scope, not cost (§4.4) |
| Aggregation across files (count, sum of linked notes) | A different feature with different performance characteristics — it cannot be evaluated per visible row |
| Writing the value into the note | A different feature with a different risk profile — §10, and a plan of its own |
| Autocomplete in the formula editor | Nice, separate, and dependent on the editing UI existing first |
| Merging the value-shape switch with the row renderer and exporter | Three consumers, three outputs (§4.6) |

---

## 9. Conventions checklist

- ES modules; JSDoc with `@param`/`@returns` on every export.
- Kebab-case filenames, camelCase identifiers.
- Services do not touch the DOM — both new modules are pure.
- No runtime dependencies, no network fetches, no build step.
- All state in `store.js`; formulas add none of their own beyond the layout definition.
- Bump `manifest.json`'s minor version per commit.

---

## 10. A later plan: writing the computed value back

Not part of this. Recorded here so the thinking is not lost, and because one of the questions
below decides what this plan's evaluator has to return.

A second kind of column that computes the same value and *writes* it into each note's front
matter, so it becomes real data another tool — or another gypsum search — could read. The open
questions:

- **When does it write?** Not on render: that would rewrite a note every time the table is drawn,
  including for files nobody looked at. A deliberate "update files" button is the right shape — it
  gives the write a moment, which is what lets it be confirmed and counted.
- **Stored or live?** Once written, the note holds a copy that goes stale the moment the linked
  note changes. Show the stored value (honest about the file, wrong) or the computed one (right,
  but then the file's copy is invisible and nobody knows it drifted)? And can a row show that it is
  out of date?
- **What does it write through?** `applyCellEdits`/`applyRawEdits` already splice front matter and
  already take a list of edits per file, which is exactly what a bulk write wants.
- **Does it depend on undo?** A button that rewrites two hundred notes is the strongest case yet
  for `plans/table-undo-stack.md` existing first. Probably yes.
- **One column or two?** A computed column with a "write these down" action against it keeps one
  mechanism; a separate stored-and-refreshable type makes the stale/live question explicit in the
  type itself.
