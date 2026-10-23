# Plan: property picker in the searchbox, opened with `/`

Status: **done**
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
through that are not in that Map: `content` and `allProperties`. It does **not** skip
`hidden_always` today — `handle:` and `contentPeek:` are accepted searches, which this plan changes
(§3.2). The Map is checked first, so a front matter key literally named `content` or `allProperties`
wins over the special name (§3.6). Anything else is dropped with a
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
- Bare `/` opens the full list (as bare `[[` does); `/sta` filters it. **The query is anything up to
  a `:` or `=`**, spaces included: a key can hold spaces, hyphens and accents (`due date`, `due-date`,
  `café` — gypsum's parser takes everything before the first colon), so `/due d` must go on
  filtering rather than close the popup. Typing the colon yourself ends the trigger, as choosing
  would.
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
**`createFilterObject` is changed to refuse `hidden_always` too**, through the same shared test, so
the picker and the search agree from one rule rather than by coincidence. That is a deliberate change
to search: `handle:` and `contentPeek:` stop being accepted. Nothing is lost — a handle only ever
matched `[object …]`, and the peek is a slice of what `content:` already searches.

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
  mean. Through `untickContentSearch()` (§4), which sets the box and runs `handleContentSearchToggle`,
  so `searchMode` and the placeholder follow — not by setting `checked` alone.
- **Choosing `tags` stops at `tags:`**, with the popup closed. The insert sets the input's value and
  fires no `input` event, and none is dispatched: the tag list opens when the next character is
  typed, as it does today.

### 3.5a The other untick, fixed alongside

`filter-delete.js` puts a deleted filter's text back in the box and sets `checked = false` on the
content checkbox directly. That fires no `change`, so `searchMode` stays `fullContent` and the
placeholder keeps describing a content search while the box shows unticked. It is fixed here because
the picker needs the right way to untick anyway: `tag-taxonomy-toggle.js` already does it
(`checked = false`, then `handleContentSearchToggle(null, checkbox)`), and with the picker and
filter-delete that is three callers — enough for one `untickContentSearch()` in
`search-content-toggle.js` that all three use.

### 3.6 Keys with spaces, colons or odd case

- A front matter key can contain a space (`due date`). The trigger lets the query hold one (§3.1),
  and `parseSearchString` splits at the first `:`, so `due date:soon` should already search — check,
  and add a level-2 test if it does.
- A key containing `=` would be split at the `=`. Rare; accepted.
- **Two keys differing only in case (`People`, `people`) are listed once**, spelled as the first match
  in `myFilesProperties` order — the key `createFilterObject` resolves either spelling to, so the
  filter that results reads the same as the item chosen. `propertiesInFiles()` returns exact names,
  so the source list has to do this itself.
- **A front matter key named `content` or `allProperties`** is listed once, and means what search
  makes of it: the front matter key, since `createFilterObject` checks the folder's keys before the
  special names (§2.2). Rare; accepted, and search is not changed for it.

### 3.7 Values after the colon

The obvious next request: `/status` → `status:` → a list of the values notes hold for `status`. That
is a value picker, the generalisation of the `tags:` picker, with its own questions (lists vs
scalars, dates, how many distinct values before it is useless). **Out of scope.** Plain-string items
(§3.3) do not get in its way: a value picker would be a third source list and nothing more.

### 3.8 A search for a property that does not exist

**Still fails silently**, logging to the console as today. Not changed by this plan.

---

## 4. Shape of the change

**No new module, no new CSS file, no new popup code.** Every piece has a home already, and two of
the pieces already exist.

| What | Where | New or existing |
|------|-------|-----------------|
| The trigger | `autocomplete/query-detect.js` — `detectSearchboxPropertyTrigger(value, caretPos)`, `^\/([^:=]*)$` against the text before the caret, beside `detectSearchboxTrigger` | new function |
| The exclusion rule | `services/property-options.js` — `propertyOptions()` already drops `hidden_always` and `control_columns` inline, for the sort modal, the flowchart options and the linked column dialog. Lift that test out as an exported `isOfferedProperty(name)` and use it there and in `createFilterObject` (§3.2) | extracted, not written |
| The source list | `autocomplete/property-source.js`, beside `tag-cache.js` — `getPropertyArray()`: the names from `propertyOptions()`, narrowed by `propertiesInFiles()` (exactly what `render-sort-list.js` already combines), deduped by case (§3.6), `allProperties` and `content` added, sorted case-insensitively. In `autocomplete/` rather than `services/` because it reads `propertiesInFiles()` from `ui/ui-functions-table/`, as the sort modal does — a service must not import from `ui/`. **No cache**: `propertiesInFiles` stops at the first file carrying each key, so this is cheap enough per keystroke, and a cache would need invalidating on every cell edit | new, small |
| Opening and choosing | `autocomplete/autocomplete.js` — `handleSearchboxAutocomplete` asks the property trigger first (as the editor asks `[[` before `#`) and sets `_kind = 'property'`; `_applySelection` branches on it: insert, untick, no search | edited |
| Inserting | `autocomplete/replace.js` — `replaceSearchboxTag(input, text, triggerStart)` already replaces from `triggerStart` to the caret. Called with `(input, key + ':', 0)` it does exactly the property's job, `/` included. **Renamed `replaceSearchboxQuery`** so the call reads true; its one caller is `autocomplete.js` | renamed, not duplicated |
| The popup | `autocomplete/popup.js`, `css/ac-picker.css`, the `--ac-picker-search` anchor — all untouched; items are plain strings (§3.3) | existing |
| Unticking | `ui-functions-click/search-content-toggle.js` — `untickContentSearch()`, beside `handleContentSearchToggle`; used by the picker, `filter-delete.js` and `tag-taxonomy-toggle.js` (§3.5a) | new function, replaces two copies |
| Shortcut line | `index.html`, under "Go to searchbox": "Pick a property to search" `/` `/` | one line |
| Version | `manifest.json` minor bump | — |

---

## 5. Tests

**Level 1: none.** Nothing here writes, renames or reads a file, and level 1 runs on every change for
ever — this would only make it slower.

**Most of it is pure, so most of it runs in node** (`appModule()`, as `58-linked-columns.spec.js`
does — milliseconds, no page load). In `tests/2-behaviour/22-tag-autocomplete.spec.js`, the spec that
already covers the searchbox picker:

1. *node* — `detectSearchboxPropertyTrigger` over a table of inputs: `/`, `/sta`, `/due d` fire;
   `a /b`, `tags:parent/child`, `/status:`, `x` do not. One test, one loop.
2. *node* — `getPropertyArray()` against a hand-built `appState.myFiles`: `allProperties` and
   `content` present and in alphabetical place; `internalId`, `handle`, `contentPeek` absent; `People`
   and `people` listed once; a key no file carries any more absent. One test.
3. *node* — `createFilterObject` refuses `handle:` (§3.2). A few lines; could join test 2.
4. *browser, one test* — the whole flow on one page load, since the page load is the cost: the global
   `/` focuses and types nothing; `/` opens the picker; `sta` filters it; Escape closes it leaving
   `/sta`; with content search ticked, choosing `status` gives `status:`, no filter chip, the box
   unticked and the properties placeholder back; clearing and choosing `tags` gives `tags:` and no
   popup; `/usr` closes itself.
5. *browser, short* — deleting a filter made with content search ticked puts the properties
   placeholder back (§3.5a). In `04-tag-filtering.spec.js` if it fits beside its filter-delete tests,
   or as a step in test 4 to save the page load.

The regex cases (`a /b`, `tags:parent/child`) are **not** repeated in the browser: test 1 holds them,
and the existing tag-picker tests already hold `tags:` opening its own list.

---

## 6. What changed in the building

- **Enter's keyup is swallowed after the popup chooses an item.** The searchbox searches on the keyup
  of Enter (`handleSearchBoxEnterPress`), while the popup takes Enter on keydown, so choosing
  `status` with Enter left `status:` in the box and the keyup straight after searched it. Not in the
  plan. `handleAutocompleteKeyup()` in `autocomplete.js` is the keydown arrangement mirrored:
  `keyUpDelegate` asks it first, and it consumes the keyup of an Enter the popup used. The tag
  choice used to search twice this way, harmlessly; it now searches once.
- **The source list reads `myFilesProperties` in its own order through `isOfferedProperty()`**, not
  through `propertyOptions()`, which sorts by `display_order`. Deduping by case must keep the first
  name in the Map's order — the one `createFilterObject` resolves to — and `propertyOptions()` has
  already lost that order. The rule is still the one function.
- **Each item ends in its colon** (`status:`), changing §3.3: the list then reads as the start of a
  search rather than a menu of commands, and an item is exactly what choosing it inserts.
