# Plan: formula columns in table view

Status: **not started — and should not start yet.** See §1.1.
Branch: `claude/table-view-customization-dduz7q`
Related: `plans/table-column-resize.md`, `plans/table-json-export.md`

---

## 1. What this delivers

A column whose value is computed per file from a short expression, rather than read from a
single property. The headline capability is following an internal link and reading a property
from the file it points at:

```
link(internalLink[0]).title
```

*"Take this file's first internal link, find the file it names, show that file's title."*

**In scope:** a small navigation language — property access, array indexing, link following —
evaluated per visible row, rendered as a table column.

**Explicitly out of scope:** arithmetic, comparisons, conditionals, aggregation across files,
sorting or filtering by a formula column, mapping over a whole array of links.

### 1.1 This depends on saved layouts — build that first

A formula column *is* a column definition, and column definitions belong in the saved-layout
file (`plans/table-column-resize.md` §2). Building formula storage before layouts exist would
create a second, parallel mechanism for "a column the user defined", which would then have to
be merged.

The formula is one more field on a layout's column entry:

```js
{ prop: "linkedTitle", label: "Project", width: 200, formula: "link(internalLink[0]).title" }
```

A column with a `formula` has no underlying file property; `prop` becomes just its key and
`label` its heading. Everything else about layouts is unchanged.

**So: layouts, then this.** The rest of this plan is the design, ready for when that is true.

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
inside `[[...]]` exactly as written. So `internalLink[0]` yields something like `"notes.md"` or
`"bob"`, which is precisely what `resolveNoteName` expects. The two halves already fit.

It is always an array, `[]` when the file has no links — deliberately, per the comment at
`file-info.js:61`.

### 2.3 There is no `internalId → file object` lookup

Nine call sites do `appState.myFiles.find(f => f.internalId === fileId)` — fine for a click
handler, wasteful for something that runs per cell per render.

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
link(internalLink[0]).status
```

`.asFile().properties` exists in Bases because its type system distinguishes a Link from a File
from that File's property bag. With one kind of file object and one property bag, those two
steps carry no information and are dropped.

### 3.2 Grammar — the whole of it

```
formula  := step ( '.' step )*
step     := NAME index?            property access, optionally indexed
          | 'link' '(' formula ')' follow a link, yielding a file
index    := '[' INTEGER ']'
NAME     := [A-Za-z_][A-Za-z0-9_]*
```

That is the entire language. No operators, no literals, no comparisons, no function library
beyond `link`. Everything it can express is navigation through data that already exists.

Examples:

| Formula | Meaning |
|---|---|
| `title` | the file's own title — a formula column can be a plain alias |
| `internalLink[0]` | the raw text of the first link |
| `link(internalLink[0]).title` | the title of the linked file |
| `link(internalLink[0]).author` | a front-matter property of the linked file |
| `link(internalLink[0]).internalLink[0]` | the first link of the linked file — raw text |
| `link(link(internalLink[0]).internalLink[0]).title` | two hops |

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
the evaluator in §3.4 came to about 35 lines before JSDoc and error handling, and produced:

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
machinery. Treat this as a sanity check on the design, not as code to copy.

### 3.4 Evaluating it

Walk the steps left to right carrying a current value, starting from the file object:

- `NAME` → `current[name]`
- `NAME[n]` → `current[name]?.[n]`
- `link(inner)` → evaluate `inner` against the *current* value, pass the result through
  `resolveNoteName`, then look up the file object by id (§2.3)

Any step that lands on `undefined` or `null` short-circuits: the rest of the chain is skipped
and the cell is empty. A broken link, a missing property and an out-of-range index all take
this path, which is why none of them need special cases.

---

## 4. Design decisions

### 4.1 Formulas read stored properties only — never other formula columns

**This is the rule that removes an entire class of problem.** If a formula could reference
another formula column, file A's column could depend on file B's, which could depend back on
A's, and evaluation would need cycle detection, memoisation and a depth limit.

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
construct that loops, so a formula also cannot hang the tab.

The grammar is small enough that this costs about a hundred lines. That is the whole price.

### 4.3 Evaluate per visible row, at render time

The table renders one page at a time (`checkFileOnPage`, `PAGINATION_SIZE` default 50), so a
formula column costs ~50 evaluations per render, each a handful of map lookups. Nothing needs
caching, precomputing or invalidating.

Do **not** evaluate at load time. That would spend the work on files nobody looks at, and would
need invalidating whenever any file changed.

### 4.4 Display-only for the first version

A formula column is not sortable and not searchable.

The reason is scope, not cost — sorting 2000 files by a formula would take a millisecond. But
sorting means teaching `file-object-sort.js` about a value that has no `FILE_PROPERTIES.type`,
and searching means threading computed values through the whole filter pipeline in
`ui-functions-search/`. Both are real features with their own edges, and neither is needed to
answer *"show me the status of the project this note links to"*.

Say so in the UI — a formula column header should not offer the sort chevron that
`render-table-header.js:12` puts on every other column.

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

A formula can land on any of the value shapes §2.5 lists. Render by inspecting the value, since
a formula column has no declared `type`:

| Value | Rendered as |
|---|---|
| string, number | as-is |
| `Date` | locale date, matching the `date` branch in `render-table-rows.js:40` |
| `Map` (i.e. `tags`) | the keys, joined — same reduction the export uses |
| array | comma-joined, or the existing `<ul class="table-view-array-list">` treatment |
| `null` / `undefined` | empty cell |

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

---

## 5. Steps

Written for when §1.1 is satisfied and layouts exist.

### 5a. `public/js/services/internal-links/note-name-index.js`

Add `byId` to `build()`'s returned object and export `getFileById(id)`. Update the JSDoc on
`build()` to say what the third map is for.

### 5b. `public/js/services/formula/parse-formula.js` (new)

The parens-aware splitter and the step matcher (§3.3). Exports `parseFormula(source)` returning
either the step array or a parse error. Pure — no `appState`, no DOM. This is the piece that
most benefits from being independently readable, so keep it free of everything else.

### 5c. `public/js/services/formula/evaluate-formula.js` (new)

Exports `evaluateFormula(steps, file)` — the left-to-right walk in §3.4, with the short-circuit
on nullish. Imports `resolveNoteName` and `getFileById`. No DOM.

A new `services/formula/` directory rather than loose files: two modules with one shared
concern, matching how `file-parsing/` and `internal-links/` are organised.

### 5d. Layout schema

Allow `formula` on a layout's column entry (§1.1). Parse each formula once when the layout is
applied, not once per row per render — store the step array alongside the column definition.
A column whose formula fails to parse is dropped with a message (§4.7).

### 5e. `public/js/ui/ui-functions-table/render-table-rows.js`

For a column carrying a formula, call the evaluator and render by value shape (§4.6) instead of
reading `file[prop.name]` and switching on `prop.type`.

### 5f. `public/js/ui/ui-functions-table/render-table-header.js`

Omit the sort trigger for formula columns (§4.4).

### 5g. Formula editing UI

Wherever layouts are edited: a text input per column, with the parse error shown inline on save.
The `autocomplete/` machinery could later offer property names, but that is a separate feature —
do not build it here.

Bump `manifest.json` minor version.

---

## 6. Files touched

```
public/js/services/formula/parse-formula.js      NEW  grammar → step array
public/js/services/formula/evaluate-formula.js   NEW  step array + file → value
public/js/services/internal-links/note-name-index.js  MOD  byId map + getFileById
public/js/ui/ui-functions-table/render-table-rows.js  MOD  evaluate formula columns
public/js/ui/ui-functions-table/render-table-header.js MOD  no sort trigger on formula columns
(layout module)                                  MOD  formula field, parsed on apply
(layout editing UI)                              MOD  formula input + parse error
manifest.json                                    MOD  minor bump
```

Nothing outside table view and the layout feature. No service gains DOM access; both new
modules are pure functions over data.

---

## 7. Verification

Run the existing suite to confirm nothing regressed: `npm install` once, then `npm test`.

Screenshots per `CLAUDE.md`: a formula column resolving a link, and the same column on a file
whose link is broken (empty cell, no error decoration).

Worth checking by hand, because it is the case the design is built around: a folder where some
notes link to a note that has the property and some link to one that does not — the column
should be populated for the first group and blank for the second, with nothing alarming shown
for either.

---

## 8. Deliberately not doing

| Not doing | Why |
|---|---|
| Arithmetic, comparisons, conditionals | Turns a navigation path into an expression language, which needs a real parser and precedence rules. The named use case does not want it |
| `eval` / `new Function` | Layout files are shareable; evaluating them as JS makes a shared layout executable code (§4.2) |
| Formulas referencing other formula columns | Removes cycles by construction (§4.1) |
| Sorting or filtering by a formula column | Scope, not cost (§4.4) |
| Mapping over a whole link array (`internalLink[*]`) | The obvious next step, and genuinely useful — but index-only answers the stated need and keeps the grammar at three rules |
| Aggregation across files (count, sum of linked notes) | A different feature with different performance characteristics — it cannot be evaluated per visible row |
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
