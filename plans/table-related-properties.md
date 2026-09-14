# Plan: a "related" column — a property read through a file's links

Status: **not started**
Branch: `claude/table-range-select-copy-paste-iq6tcf`
Related: `plans/table-formula-columns.md`, which overlaps this heavily — see §1.2
Depends on: `plans/completed/table-saved-layouts.md` and `plans/completed/property-type-store.md`,
both **built**

---

## 1. What this delivers

A column that shows a property of the file (or files) this note links to, rather than a property of
the note itself. Follow `project` to the note it names, show that note's `status`.

**In scope:** a new column type whose value is computed per row from a link and a property name; a
way to add such a column from the UI; a type editor that makes the reference easy to write;
mapping over a list of links, so a note with four links yields a list of four values.

**Explicitly out of scope for the first version:** writing the computed value back into the note
(§2, last bullet — a sketch only, not built here), arithmetic or conditionals, aggregation across
files (count, sum), sorting or searching by a related column.

### 1.1 The reference property may hold one link or many

Two shapes, one rule. A `string` column whose text is a link yields a single value; an `array`
column of links yields a list with one value per link, in the links' own order. That the result is
a list when the source is a list is what makes the column read naturally — four linked projects,
four statuses, lined up with each other.

### 1.2 Its relationship to `plans/table-formula-columns.md` is the first thing to settle

That plan already designs `link(internalLink[0]).title`: a small navigation grammar, an
interpreter rather than `eval` (its §4.2, and that reasoning holds here — a layout file is
shareable data), per-visible-row evaluation, and the `byId` index to add to
`note-name-index.js`. Two plans building two mechanisms for "a column computed from a link" would
have to be merged later.

Note also that the formula plan predates the `propertyTypes` store: its §1.1 puts the formula on
the layout's *column* entry, which is where types used to live. CLAUDE.md now says a type belongs
to the property. Whichever plan is built, that question has to be re-answered — and it is the same
question as the first bullet in §2.

Also unresolved between them: the formula plan explicitly rules out mapping over a whole link array
(`internalLink[*]`) in its §8, and §1.1 above makes it the point of this one.

---

## 2. Key decisions to settle before writing code

- **Whether this is a property type or a column definition.** It is described as a type, but types
  now live in `propertyTypes` keyed by property name, and a related column has no underlying
  property — it *is* the definition. Decide whether `related` joins `VALUE_TYPES` (and so needs a
  `#icon-type-related` symbol and a `LOCK_SHIFT` entry), or whether a related column is a new kind
  of layout column entry that carries its own type for how the *result* renders. The second seems
  likelier and would mean a layout file grows a shape it has never had.
- **Where a new column is added from, and what "add" means when there is no property behind it.**
  The column menu and the layouts modal are both named as homes. Every column today comes from a
  property some file has; this is the first one a user invents. Decide whether the layouts modal
  owns creation (it already lists columns) with the column menu offering a shortcut, and what
  happens to a related column when no layout is saved.
- **The syntax, and how much of it the editor writes for you.** If the type editor is two pickers —
  a reference property, then a property name to read off the far end — then the stored syntax is an
  implementation detail and could be two fields rather than a string. A string is only worth it if
  chains longer than one hop are wanted. Decide that first, because it decides whether any of the
  formula plan's parser (its §3.3) is needed at all.
- **Whether the far property can itself be related.** The formula plan's §4.1 forbids a formula
  reading another formula column, which makes cycles impossible by construction. Take that rule, or
  face cycle detection between two notes that link to each other.
- **What a missing answer looks like.** A broken link, a linked note without that key, and a
  reference property that is empty are all normal and per-row. The formula plan's §4.7 separates
  these from a malformed definition, which is wrong for every row; decide the same split here, and
  decide what a *partly* resolved list shows — four links, two with a status, is the common case,
  and a two-item list silently loses which links they came from.
- **How the result is typed and rendered.** The value comes back from another note's front matter
  with no declared type. Decide whether the column carries a type for its result (dates from a
  linked note being the case that needs one) or renders by inspecting the value's shape.
- **Sorting and searching.** Both are ruled out above, following the formula plan's §4.4. Worth
  confirming, since a status pulled from a linked project is a thing people will want to sort by,
  and the header must then not offer a sort chevron it cannot honour.
- **Cells take no caret, and the header should say so.** A computed column is not editable, which
  is the existing lock machinery — decide whether it wears the padlock, the info glyph, or a mark
  of its own, since it is not the app's own data in the way `lastModified` is.

### 2.1 The write-back variant — sketch only, not built here

A second column type that computes the same value and *writes* it into each note's front matter, so
it becomes real data another tool could read. Questions it raises, none of them answered:

- **When does it write?** Not on render — that would write a note every time the table is drawn, on
  files nobody looked at. A deliberate "update files" button is the shape suggested, and is
  probably right: it makes the write an action with a moment, which is what lets it be confirmed
  and counted.
- **What is the relationship between the stored value and the live one?** Once written, the note
  holds a copy that goes stale the moment the linked note changes. Decide whether the column shows
  the stored value (honest about what is in the file, stale) or the computed one (correct, but then
  the file's copy is invisible and nobody knows it drifted), and whether the table can show that a
  row is out of date.
- **What does it write through?** `applyCellEdits`/`applyRawEdits` already splice front matter and
  take a list of edits per file, which is what a bulk write wants. See `plans/table-undo-stack.md`
  §6.2 — a button that rewrites two hundred notes is the strongest case yet for undo existing
  first, and probably makes this depend on it.
- **Is it one column or two?** A computed column with a "write these values down" action against
  it, or a separate type that is stored-and-refreshable. The first keeps one mechanism; the second
  makes the stale/live question above explicit in the type.
