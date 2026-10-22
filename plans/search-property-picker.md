# Plan: property picker in the searchbox, opened with `/`

Status: **not started — design settled**
Related: `public/js/autocomplete/` (the popup session this joins), `plans/completed/table-value-types.md`
(what a property's search type is)

---

## 1. What this delivers

A `/` typed as the first character of the searchbox opens the autocomplete picker — the same popup
that `tags:` and `[[` already open — listing the property keys a search can be aimed at: `title`,
`filename`, `status`, `people` and so on, plus the two that are not properties at all,
**`allProperties`** and **`content`**. Choosing one replaces the `/` and whatever was typed after it
with the key and its colon, leaving the caret ready for the value.

It is not a command palette. Every item is the left-hand side of a `key:value` search, which the
searchbox already understands; the picker only saves remembering, and spelling, what the folder's
notes call things.

**In scope:** the `/` trigger, the list, filtering it as you type, inserting the chosen key.

**Out of scope (see §3.7, §3.8):** completing the *value* after the colon for anything but `tags:`,
new operators, a picker opened by a button rather than a key, column labels or hints in the list, and
any message for a search of a property that does not exist.

---

## 2. Current state — facts the design depends on

### 2.1 The searchbox already has one picker, and it is keyed off text

`handleSearchboxAutocomplete()` in `autocomplete/autocomplete.js` runs on every `input` event of
`#searchbox` (`data-action="search-files"`). It asks `detectSearchboxTrigger()` in `query-detect.js`
whether the text before the caret ends in `tags:…`, and if so lists `getTagArray()` filtered by
`filterItems()`. `replaceSearchboxTag()` in `replace.js` splices the choice into the `<input>`, and
`_applySelection()` then **runs the search at once** (`handleSearchBoxClick()`).

So a second searchbox picker is a second detector, a second source list, a second writer — and one
question about whether choosing it searches (it must not: §3.5).

### 2.2 What the parser accepts

`parseSearchString()` (`a-search-parse-string.js`) splits at the first `:` or `=` that is not the
first character. Anything before it is the property; no operator means `allProperties`.
`createFilterObject()` matches the property against `appState.myFilesProperties` **case-
insensitively**, skips `TABLE_VIEW_COLUMNS.control_columns` (`internalId`), and lets two names
through that are not in that Map: `content` and `allProperties`. Anything else is dropped with a
`console.log` and nothing on screen — which stays as it is (§3.8).

### 2.3 The keys are not the column labels

Search matches **keys**, and several columns are headed by a label instead: `sizeInBytes` is "size",
`lastModified` is "last modified", `internalLink` is "links", `fileIssues` is "issues". The picker
lists keys only (§3.3), so it shows the user the name a search actually needs.

### 2.4 The content checkbox overrides the prefix

With `#contentsearch` ticked, `parseSearchString(searchString, "content")` ignores any `key:` in the
string and searches the whole text for it, colon included. A key chosen from the picker would be
silently searched for as text — hence §3.5.

### 2.5 `/` already means something, in three places

- **It is the shortcut that focuses the searchbox.** `keyboard-shortcuts.js` maps `/` to
  `searchbox.focus()` with `preventDefault()`, and only while focus is *not* already in the box — so
  that press never types a `/`, and a `/` typed inside the box is an ordinary character today.
- **It is the tag separator.** `tags:parent/child` is a search people already type, and
  `detectSearchboxTrigger` deliberately allows the `/`.
- **It is in values.** `filepath:notes/2026`, a date typed `01/03/2026`, a URL in a front matter
  value.

So the trigger has to be narrow enough to leave all three alone (§3.1).

---

## 3. Decisions

### 3.1 What opens it

- **A `/` as the first character of the box, and nowhere else.** Not after a space either. That is
  what keeps every use in §2.5 safe: no `tags:` value, path or date ever starts the box. Starting the
  box is enough, because a search builds one filter and the box is emptied once it is added
  (`addFilterThenFindMatches`) — the next filter starts at the start again.
- Bare `/` opens the full list (as bare `[[` does); `/sta` filters it.
- A search value that genuinely starts with `/` (`/usr`) opens the picker, but `filterItems` finds no
  key matching `usr` and the popup closes itself (an empty list already dismisses), leaving the text
  as typed. Harmless; worth a test.
- **The global shortcut is unchanged: the first `/` focuses the box and types nothing; a `/` typed in
  the box opens the picker.** From anywhere in the app the picker is `/` `/`. A single `/` that did
  both would have to type the `/` for the trigger to anchor to, and everyone pressing `/` to type a
  plain search would find `/draft` in the box. The shortcuts dialog (`index.html`, beside "Go to
  searchbox") gains one line: "Pick a property to search | `/` `/`".
- **Escape leaves the `/` where it is.** It closes the popup and nothing else, as Escape does in every
  other picker. `/status` with nothing chosen is then a search for `/status`, which matches nothing,
  harmlessly. Escape in the searchbox also blurs it (`keyboard-shortcuts.js`); with a popup open,
  `handleAutocompleteKeydown` consumes Escape first, so the first Escape closes the picker and the
  second leaves the box — check this holds.
- No tap target. `/` is on the first symbol layer of most phone keyboards.

### 3.2 Which keys are listed

The source is the properties `createFilterObject()` would accept, so the picker can never offer a
key the search would then refuse:

| Key | Listed? | Why |
|-----|---------|-----|
| `allProperties` | **yes, always** | special-cased in `searchFiles()` |
| `content` | **yes, always** | special-cased; reads every note, so slower |
| front matter keys | yes | the main point |
| `title`, `filename`, `filepath`, `tags`, `color`, `lastModified`, `sizeInBytes`, `fileIssues`, `internalLink`, `internalLinkText` | yes | searchable today |
| `internalId` | **no** | a control column; `createFilterObject` skips it |
| `handle`, `contentPeek` | **no** | `hidden_always`; a handle searches as `[object …]`, the peek is a slice of `content` |
| linked columns (`linked:<n>`) | **no** | not searchable (CLAUDE.md, *Linked columns*), and not in `myFilesProperties` anyway |
| a key no loaded note carries any more | **no** | asked of `propertiesInFiles()`, as the sort modal asks, never of `myFilesProperties`, which only grows (CLAUDE.md, *An empty column*) |

The exclusions are the existing `control_columns` and `hidden_always` — no new list in `store.js`.
`createFilterObject` refuses `hidden_always` too, through the same test, so the picker and the search
agree from one rule rather than by coincidence.

### 3.3 What each item shows

**The key, and nothing else** — spelled as stored, since that is what will be inserted, and without
the colon (it is added on insert). No column label, no hint for `allProperties` or `content`, no type
glyph. So `popup.js` is untouched: items stay plain strings, as the tag and note lists are.

### 3.4 Order of the list

**Alphabetical, case-insensitive, `allProperties` and `content` included** — they sit where their
names put them rather than pinned to the top. That is the pre-sorted list `filterItems` expects, and
its prefix-first rule then applies as it does for tags: `/c` shows `color`, `content`, … before keys
that merely contain a `c`. No recently-used ordering.

### 3.5 What choosing one does

- Replaces `/query` with `key:`, caret after the colon. Always `:`, which is what the parser
  normalises `=` to.
- **Does not search.** There is no value yet. So `_applySelection()` must not call
  `handleSearchBoxClick()` for this kind — a `_kind === 'property'` branch, the same way the editor
  distinguishes `'tag'` from `'link'`.
- **Unticks content search** if it is ticked (§2.4): the user has just said which property they
  mean. Through the same path `toggle-content-search` uses, so the checkbox's icons follow.
- Choosing `tags` leaves the text ending in `tags:`. If the insert fires an `input` event the tag list
  opens straight away; that is the behaviour to aim for, since it is the obvious next step.

### 3.6 Keys with spaces, colons or odd case

- A front matter key can contain a space (`due date`). `parseSearchString` splits at the first `:`,
  so `due date:soon` should already work — check, and add a level-2 test if it does.
- A key containing `=` would be split at the `=`. Rare; accepted.
- Two keys differing only in case (`People`, `people`) are listed once, as the search sees them — it
  uses whichever it meets first.

### 3.7 Values after the colon

The obvious next request: `/status` → `status:` → a list of the values notes hold for `status`. That
is a value picker, the generalisation of the `tags:` picker, with its own questions (lists vs
scalars, dates, how many distinct values before it is useless). **Out of scope.** Plain-string items
(§3.3) do not get in its way: a value picker would be a third source list and nothing more.

### 3.8 A search for a property that does not exist

**Still fails silently**, logging to the console as today. Not changed by this plan.

---

## 4. Shape of the change

1. `query-detect.js` — `detectSearchboxPropertyTrigger(value, caretPos)`: `^\/(\w*)$` against the text
   before the caret. Asked **before** `detectSearchboxTrigger`; anchored to the start of the box, so
   it can never fire inside a `tags:` value.
2. A source list: a small `services/` function returning the searchable keys, alphabetical (§3.2,
   §3.4), with `allProperties` and `content` added. It and `createFilterObject` share the exclusion
   test.
3. `autocomplete.js` — `handleSearchboxAutocomplete` asks the property trigger first (as the editor
   asks `[[` before `#`), sets `_kind = 'property'`; `_applySelection` inserts, unticks content
   search, and does not search.
4. `replace.js` — generalise `replaceSearchboxTag` to take the start and end of the text being
   replaced, or add `replaceSearchboxProperty(input, key)`; the property one replaces from index 0,
   `/` included.
5. Shortcuts dialog line; manifest minor bump.

Tests: level 2, in `tests/2-behaviour/22-tag-autocomplete.spec.js`, which already covers the
searchbox picker — `/` at the start opens it and filters, `a /b` and `tags:parent/child` do not,
`allProperties`/`content` are present and in alphabetical place, `internalId`/`handle` are absent,
choosing inserts `key:` without searching and unticks content search, choosing `tags` opens the tag
list, Escape leaves the `/`, `/usr` closes itself, and the global `/` still focuses without typing.
No level-1 test: nothing here touches a file.
