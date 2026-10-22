# Plan: property picker in the searchbox, opened with `/`

Status: **not started — brainstorm**
Related: `public/js/autocomplete/` (the popup session this joins), `plans/completed/table-value-types.md`
(what a property's search type is)

---

## 1. What this delivers

Typing `/` in the searchbox opens the autocomplete picker — the same popup that `tags:` and `[[`
already open — listing the property keys a search can be aimed at: `title:`, `filename:`, `status:`,
`people:` and so on, plus the two that are not properties at all, **`allProperties:`** and
**`content:`**. Choosing one replaces the `/` and whatever was typed after it with the key and its
colon, leaving the caret ready for the value.

It is not a command palette. Every item is the left-hand side of a `key:value` search, which the
searchbox already understands; the picker only saves remembering, and spelling, what the folder's
notes call things.

**In scope:** the `/` trigger, the list, filtering it as you type, inserting the chosen key.

**Out of scope (for now — see §4):** completing the *value* after the colon for anything but
`tags:`, new operators, a picker opened by a button rather than a key.

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
`console.log` — **the user is told nothing**, which is the failure this feature mostly exists to
prevent.

### 2.3 The keys are not the column labels

Search matches **keys**, and several columns are headed by a label instead: `sizeInBytes` is "size",
`lastModified` is "last modified", `internalLink` is "links", `fileIssues` is "issues". A user who
reads the table header and types `size:` gets nothing. The picker is the first place the key and the
label can be shown side by side.

### 2.4 The content checkbox overrides the prefix

With `#contentsearch` ticked, `parseSearchString(searchString, "content")` ignores any `key:` in the
string and searches the whole text for it, colon included. A key chosen from the picker would be
silently searched for as text.

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

## 3. Decisions to make at this stage

Each has a recommendation; none is settled until this section is.

### 3.1 What exactly opens it

- **Recommendation: `/` as the first character of the box, or straight after a space** — the same
  shape as `#` in the editor (`detectEditorTrigger` refuses `foo#bar`). That rule is what keeps the
  three uses in §2.5 safe: `tags:parent/child`, `filepath:notes/a` and `01/03/2026` never have a `/`
  at the start or after a space. A `/` anywhere else stays a literal character.
- A search value that genuinely starts with `/` (`/usr`) opens the picker, but `filterItems` finds no
  key matching `usr` and the popup closes itself (an empty list already dismisses), leaving the text
  as typed. Harmless; worth a test.
- Bare `/` opens the full list (as bare `[[` does); `/sta` filters it.
- **The global shortcut stays as it is: the first `/` focuses the box and types nothing; a `/`
  typed in the box opens the picker.** So from anywhere in the app the picker is `/` `/`. The
  alternative — one `/` both focuses and opens the picker — would have to type the `/` for the
  trigger to have something to anchor to, and then everyone who presses `/` to type a plain search
  finds `/draft` in the box. **Recommendation: `/` `/`**, and say so in the shortcuts dialog
  (`index.html`, beside "Go to searchbox"): "Pick a property to search | `/` `/`". The searchbox's
  `data-tip` ("search files | /") could gain it too.
- The `/` is a trigger, never text: it is replaced on selection. **On Escape, left or removed?**
  Leaning *left* — Escape in every other picker only closes the popup, and deleting a character the
  user typed is surprising. Then `/status` with nothing chosen is a search for `/status`, which
  matches nothing, harmlessly. Note that Escape in the searchbox also blurs it (`keyboard-shortcuts.js`);
  with a popup open, `handleAutocompleteKeydown` consumes Escape first, so the first Escape closes the
  picker and the second leaves the box — check this holds.
- Phones: `/` is on the first symbol layer of most soft keyboards, so no tap target is strictly
  needed. A button beside the existing `#` tag button (`searchbox-tag-btn`) would be a separate
  design — the `#` button opens the tag taxonomy, not a picker. **Recommendation: not in this plan.**

### 3.2 Which keys are listed

The source is `appState.myFilesProperties`, the same Map `createFilterObject()` searches, so the
picker can never offer a key the search would then refuse. Then:

| Key | Listed? | Why |
|-----|---------|-----|
| `allProperties` | **yes, always, first or second** | special-cased in `searchFiles()` |
| `content` | **yes, always** | special-cased; reads every note, so slower |
| front matter keys | yes | the main point |
| `title`, `filename`, `filepath`, `tags`, `color`, `lastModified`, `sizeInBytes`, `fileIssues`, `internalLink`, `internalLinkText` | yes | searchable today |
| `internalId` | **no** | a control column; `createFilterObject` skips it |
| `handle`, `contentPeek` | **no** | `hidden_always`; a handle searches as `[object …]`, the peek is a slice of `content` |
| linked columns (`linked:<n>`) | **no** | not searchable (CLAUDE.md, *Linked columns*), and not in `myFilesProperties` anyway |
| a key in a layout but in no loaded note (`dead`) | **no** | it would match nothing; follows from using `myFilesProperties`… which only grows, so a key whose last value was deleted *would* still be listed — accept, or ask `propertiesInFiles()` as the sort modal does? **Recommendation: `propertiesInFiles()`**, for the reason CLAUDE.md gives under *An empty column*. |

Open: is the exclusion list one new named list in `store.js` (`TABLE_VIEW_COLUMNS.unsearchable`?) or
the existing `control_columns` plus `hidden_always`? **Recommendation: the existing two** — no new
list unless a third reason appears. `createFilterObject` should then refuse `hidden_always` too, so
the picker and the search agree from one rule rather than by coincidence.

### 3.3 What each item shows

- The **key**, as the note spells it, since that is what will be inserted.
- The **label beside it when it differs** (`sizeInBytes — size`), and matched by the filter too, so
  `\size` finds `sizeInBytes`. This is the cheapest fix for §2.3 there is.
- `allProperties` and `content` with a word of explanation ("any property", "full note text") — they
  are the two a newcomer cannot guess.
- **The type glyph?** `type-glyph.js` already draws the column's mark; a list vs a text vs a date
  matters because it changes how the value is matched (whole item vs part). Nice, not essential.
  **Recommendation: phase 2.**
- `popup.js` today renders plain strings (`highlightMatch` over `item`). Showing a second line or a
  label means items become `{value, label, hint}` objects, which touches the editor's and the cell's
  callers. Alternative: keep strings and render the hint from a lookup inside the searchbox branch
  only. Decide which before building — it is the one structural change here.

### 3.4 Order of the list

- **Recommendation:** `allProperties`, `content`, then the rest in the order of the active table
  layout's columns (what the user sees), unlisted properties after, alphabetical. Alternative: plain
  alphabetical (simpler, and what `filterItems` assumes — it wants a pre-sorted list and puts prefix
  matches first). Whichever is chosen, `filterItems`' prefix-first rule should still apply on top.
- Should recently used keys float up? **No** — that is state to keep, and the list is short.

### 3.5 What choosing one does

- Inserts `key:` (lower-camel exactly as stored) in place of `\query`, caret after the colon.
- **Does not search.** Unlike the tag picker, there is no value yet. So `_applySelection()` must not
  call `handleSearchBoxClick()` for this kind — a `_kind === 'property'` branch, the same way the
  editor distinguishes `'tag'` from `'link'`.
- If the chosen key is `tags`, the existing `tags:` detector should fire straight away and open the
  tag list, since the text now ends in `tags:`. Free if the insert dispatches an `input` event; worth
  a deliberate decision either way.
- `:` or `=`? Always `:` — it is what the parser normalises to.
- If the content checkbox is ticked (§2.4), choosing a key should **untick it**, or the key is
  searched as text. Alternatively grey out every item but `content` while it is ticked. **Recommend
  untick** — the user just said which property they mean.

### 3.6 Keys with spaces, colons or odd case

- A front matter key can contain a space (`due date:`). `parseSearchString` splits at the first `:`,
  so `due date:soon` already works — check, and add a level-2 test if it does.
- A key containing `=` would be split at the `=`. Rare; accept and note it.
- Two keys differing only in case (`People`, `people`): the search picks whichever it meets first.
  The picker would list both and the search would quietly use one. Accept, or list once? **List
  once**, as the search sees it.

### 3.7 Values after the colon

The obvious next request: `\status` → `status:` → a list of the values notes hold for `status`. That
is a value picker, the generalisation of the `tags:` picker, and it has its own questions (lists vs
scalars, dates, how many distinct values before it is useless). **Recommendation: out of scope,
named here so the design of §3.3 does not rule it out** — if items become objects, a value picker is
a third source list and nothing more.

### 3.8 Surfacing the failure the picker exists to prevent

Independently of the picker, a search for a property that does not exist logs to the console and
does nothing (§2.2). Should it say so on the report line? **Recommendation: yes, small, separate
commit** — it is the same problem from the other side, and the picker cannot catch a key typed by
hand.

---

## 4. Shape of the change (once §3 is settled)

1. `query-detect.js` — `detectSearchboxPropertyTrigger(value, caretPos)`: `(^|\s)\/(\w*)$`. It must be asked
   **before** `detectSearchboxTrigger`, and must not fire inside a `tags:` value — the anchor to the
   start or a space is what guarantees that.
2. A source list: a small `services/` function returning the searchable keys in order (§3.2, §3.4),
   with `allProperties` and `content` added. One reader of `myFilesProperties` plus the exclusions —
   so it, and `createFilterObject`, should share the exclusion test.
3. `autocomplete.js` — `handleSearchboxAutocomplete` asks the property trigger first (as the editor
   asks `[[` before `#`), sets `_kind = 'property'`; `_applySelection` inserts and does not search.
4. `replace.js` — `replaceSearchboxProperty(input, key, triggerStart)`, or generalise
   `replaceSearchboxTag` to take the text to insert.
5. `popup.js` — only if §3.3 chooses object items.
6. Shortcuts dialog line; manifest minor bump.

Tests: level 2, in `tests/2-behaviour/22-tag-autocomplete.spec.js`, which already covers the searchbox picker — `/` at the start and after a space opens it, filtering,
`allProperties`/`content` present, `internalId`/`handle` absent, choosing inserts `key:` and does
not search, `tags:parent/child` and `filepath:a/b` do not open it, `/usr` closes itself, and the global `/`
still focuses without typing. No level-1 test: nothing here touches a file.

---

## 5. Open questions for the user

- `/` only at the start or after a space? (§3.1)
- `/` `/` from outside the box, or one `/` that focuses and opens? (§3.1)
- Leave the `/` on Escape, or remove it? (§3.1)
- Show labels and hints, accepting the `popup.js` change? (§3.3)
- Layout order or alphabetical? (§3.4)
- Untick content search on selection? (§3.5)
- Also report "no such property" on the report line? (§3.8)
