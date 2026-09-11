# Plan: what the front matter parser should be

Branch: `claude/yaml-parser-improvements-yelc0o`
Manifest version now: `1.176.0` → bump the minor version with each step that changes code.
Related: `plans/table-value-types-and-editing.md`, which this was split out of and which depends on it.

This plan is the write-up of a design discussion. Nothing here has been built yet. **§0 is
lifted unchanged from §4 of the types plan**, which is where these bugs were first written
down. Everything after it is new.

---

## 0. Bugs found in the front matter parser while discussing this

These were found by running the parser directly, not by reading it. They are the reason the
plan starts with parser work rather than type work.

A list in front matter renders as `[object Object]` in the table under certain conditions.
**Quoting the items makes no difference. Only the whitespace before the dash matters.**

| what comes before the dash | result | error recorded? |
|---|---|---|
| one or more ordinary spaces | a proper list, shown comma-separated | — |
| a tab | an empty object, shown as `[object Object]` | yes |
| a non-breaking space | an empty object, shown as `[object Object]` | yes |
| nothing, flush against the left margin | an empty object, shown as `[object Object]` | yes |
| a dash line containing a colon and a space | a nonsense object | **no** |

Four separate faults, all landing on the same symptom:

1. **Indentation is measured in ordinary spaces only.** The loop that counts indentation only
   steps over the space character, so a tab or a non-breaking space reads as no indentation
   at all.
2. **A list flush with its key is rejected outright.** The parser discards the key's context
   when the indentation is not greater than the key's own, then finds no parent and records
   "root level list item unsupported". **This shape is perfectly valid front matter and
   several editors produce it.** This is the real bug of the four.
3. **The colon check runs before the dash check.** A line reading `- apple: red` is treated
   as a key and value, so the key becomes the literal text `- apple`. **This one records no
   error at all**, which makes it the worst of the set.
4. **The leftover empty object is what makes it ugly.** A key with nothing after the colon
   creates an empty object as a placeholder for the nesting expected to follow. When the
   following lines fail, that placeholder stays. It counts as a real value, so it reaches the
   cell and prints as `[object Object]`.

Two notes on severity. Tabs and non-breaking spaces are genuinely not valid front matter
indentation, so rejecting them is defensible and the app only needs to say so more clearly.
A list flush with its key is valid and common, so that is a straightforward bug.

And the comma-separated appearance of a working list is not a deliberate choice either. An
untyped property falls through to the default branch, which drops the value straight into the
cell, and a JavaScript list turns into its items joined by commas.

**The cheapest worthwhile fix, which stands entirely on its own:** when a key ends up holding
an empty placeholder object, store nothing instead. Every case above then produces a blank
cell alongside the load error that is *already being recorded*, rather than a cell that reads
`[object Object]`. That is the difference between a note that looks corrupted and a note that
is visibly flagged, and it needs no type system to get there.

**Types cannot fix any of this.** The type layer sits downstream of the parser and cannot
recover a list the parser threw away. Types make a bad value legible. They do not repair it.

---

## 1. The two rules this parser lives by

Stated up front because every recommendation below is decided by them.

**It is not trying to be a YAML parser.** It reads the front matter of personal notes. Anchors,
multi-document streams, block scalars, explicit tags, complex keys — none of that is wanted, and
every one of them would cost more than it returns.

**Speed is the constraint.** The parser runs once per file on every folder load, and a folder is
hundreds or thousands of files. A millisecond per file is a second of blank screen.

One consequence worth stating plainly, because it decided most of what follows: **those two rules
point the same way far more often than they conflict.** The measurements in §2 show the syntax
being asked for costs nothing, and that what the parser does spend its time on has nothing to do
with YAML.

---

## 2. Where the time actually goes

Measured with Node on this repo's own code, 20,000 iterations per figure, warmed.

### 2.1 The two paths, which are not the same path

**The load path** runs `getFileDataAndMetadata` once per file in the folder. It calls
`findFrontMatterIndices`, then `parseYaml`, then `parseFileContent` for title, tags, links and
the content preview. It never renders markdown.

**The render path** runs `parseContent` when one file is opened in the content modal, the render
toggle is used, or a history version is viewed. This is the one that lifts the front matter out,
runs marked over what is left, and puts a rendered properties panel back in its place.

Everything about speed in this document is about the load path. **The render path handles one
file on a deliberate user action**, so its cost is invisible whatever it does — about 50 µs on a
40KB note, once, on a click. It is not worth optimising and this plan does not propose to.

That distinction matters because the front matter removal and reinsertion — `replaceFrontMatter`
splitting, splicing and joining — happens **only on the render path**. The three whole-file splits
described below are on the load path, where nothing is removed or put back and nothing is
rendered. They exist only to read a dozen lines at the top of the file.

### 2.2 The three splits on the load path

A note of about 45KB with eleven lines of front matter:

| what | time |
|---|---|
| `parseYaml` on the whole file | 8.0 µs |
| `findFrontMatterIndices` alone | 2.6 µs |
| one `split("\n")` of that file, alone | 2.4 µs |
| `parseYaml` on the front matter block alone, body stripped | 2.5 µs |

**The parse loop is not the cost. Splitting the file into lines is.** `parseYaml` calls
`getFrontMatterLines`, which calls `findFrontMatterIndices`, which splits the whole file; then
`getFrontMatterLines` splits the whole file again to slice eleven lines out of it. `file-info.js`
calls `findFrontMatterIndices` separately before it calls `parseYaml`, so the third split happens
before either of those.

It gets worse on a file with no front matter at all. `findFrontMatterIndices` uses `findIndex`
to look for the opening `---`, which scans every line of the file — and then rejects the result
if it turns up after line 5. The rule is "within the first five lines" but the search is the
whole document.

A prototype that finds the block with `indexOf` over the raw string, never splitting anything it
does not need:

| case | current | prototype | |
|---|---|---|---|
| bounds, 45KB with front matter | 2.72 µs | 0.37 µs | 7× |
| bounds, 45KB no front matter | 3.17 µs | 0.13 µs | 25× |
| bounds, no front matter, `---` at line 60 | 5.00 µs | 0.10 µs | 48× |
| full parse, 45KB with front matter | 7.3 µs | 2.5 µs | 3× |
| full parse, 45KB no front matter | 3.3 µs | 0.26 µs | 13× |

The line indices that `parse-content.js` and the diff highlighter need are still returned: the
walker counts lines as it goes. **Nothing downstream has to change to get this.**

### 2.3 But the YAML work is not what makes a folder slow

**This is the figure that decides how much any of the above is worth, and it is the one it would
have been easiest not to measure.** The load path was never O(front matter) and removing these
splits will not make it so, because `parseFileContent` runs a global `matchAll` for titles, tags
and links over the whole body, and `getContentPeek` splits the whole file with a regex to read
about three lines from it. Per file, on realistic prose with a handful of tags in it:

| | 4KB note | 40KB note |
|---|---|---|
| YAML path, the three splits | 7.3 µs — 19% | 36.6 µs — 11% |
| `getContentPeek` regex split | 4.9 µs — 12% | 41.2 µs — 12% |
| title/tag/link `matchAll` | 27.2 µs — 69% | 253.3 µs — 77% |
| **total per file** | **39.4 µs** | **331.1 µs** |

So the honest size of the prize: **removing all three splits saves 10% to 15% of folder load**,
not a multiple of it. A folder of 500 notes averaging 40KB spends about 165 ms in
`getFileDataAndMetadata`, of which roughly 18 ms is YAML and roughly 125 ms is the tag scan.

Two things follow, and they pull in opposite directions.

**Against doing the speed work for its own sake:** 10% of a load is not something anyone will
see. If the only argument for §7.1 were speed, it would not be worth the churn.

**For doing it anyway:** it is not the only argument. The same change is what makes the reverse
direction in §5 possible at all, since a parser that splits into an array has thrown away the
character offsets a splice needs. The speed is a by-product of the shape the writer requires.
**That is the reason to do it, and the 10% is a bonus.**

And a third thing, out of scope but worth writing down where it will be found. **`getContentPeek`
is this plan's own mistake in different code**: it splits a 40KB file into an array of lines to
read about three of them, and a walk that stops at 130 characters would cost nothing. The tag
`matchAll` is a different matter — it is genuinely O(body) and has to be, since a tag can appear
anywhere in a note. The only waste there is that it also scans the front matter block, which the
bounds from §7.1 would let it skip. Neither belongs in this plan. Both belong in a plan.

### 2.4 What the syntax costs

Nothing, which is the single most useful figure here. **The prototype behind every number above
already supports flush lists, flow lists and tabs.** Its 2.5 µs parse is with all three in place.
Adding them does not register against the splits being removed in the same change.

---

## 3. The syntax to add

### 3.1 Non-indented lists — yes

```yaml
tags:
- web
- production
```

Valid YAML, produced by several editors, and currently thrown away with two recorded errors and
an `[object Object]` in the cell. This is §0's bug 2 and it is the real one.

The fix is in how a dash line finds its owner. Today the parser pops the stack down to the
current indentation *before* looking at the line, so a dash at the same indentation as its key
has already discarded the key by the time it is read. A dash line has to be recognised first and
keep the key context it belongs to.

### 3.2 Flow lists on one line — yes

```yaml
tags: [ web, production ]
tags: ["spider web", "production"]
```

About fifteen lines: a scan for commas that ignores commas inside quotes, reusing the existing
value coercion for each item. **The branch is only entered when a value starts with `[` and ends
with `]`**, so a note that never uses the form pays one character comparison per line.

Two things it brings with it, both acceptable and both worth writing down:

- `note: [draft] needs work` stays a string, because it does not end in `]`. But `note: [draft]`
  becomes a one-item list. That is what real YAML does too, and it is the reason the quoting rule
  in §4.2 has to grow one character.
- An unbalanced `tags: [a, b` cannot be a list. It should record an error rather than silently
  becoming the string `[a, b`.

### 3.3 Tabs — yes, but almost nothing needs writing

This was the one the discussion was unsure about, and the measurement settles it in an unexpected
way. **Once flush lists are accepted, tab-indented and non-breaking-space-indented lists start
working on their own**, with no code aimed at them. A tab reads as zero indentation, zero
indentation is now legal for a list item, so the item finds its key. Both of §0's rows 2 and 3
stop being broken as a side effect of fixing row 4.

That leaves exactly one broken shape: a tab-indented **key** under a parent key, which reads as
zero indentation, reparents to the root, and records no error.

**Recommendation: treat a tab as one unit of indentation, the same as a space.** In the loop that
counts indentation, that is `c === 32 || c === 9` in place of `c === 32` — measurably free, since
the loop runs once per leading character and there are rarely more than four.

The reason this is safe despite YAML forbidding tabs is that **the parser only ever compares
depths, never measures them.** It asks "is this line deeper than its parent", never "how many
columns in is this". So the unanswerable question — is a tab worth 1 column, 4, or 8 — never
comes up, as long as a file is consistent with itself. A file mixing tabs and spaces at the same
level will nest wrongly, but such a file is broken for every other YAML tool too.

**Do not do the same for the non-breaking space.** A tab is at least visible as indentation in an
editor; an nbsp is indistinguishable from a space on screen, and quietly accepting it would let a
file that no other tool reads look perfectly fine here. Leaving it at zero indentation means
nbsp-indented lists keep working by the flush-list route and nbsp-indented keys stay flagged,
which is the honest split.

---

## 4. Does editing in place restrict what we should allow?

The question was specifically about flow lists, and the short answer is **no — and flow lists are
in fact the easy case.**

### 4.1 The rule that makes it a non-issue: preserve the shape you found

A splice writer must never impose a style. If a note says `tags: [ web, production ]` and the
user edits it, the result must come back as a flow list. If the note spreads its list over four
lines, the result must come back over four lines. **Flow in, flow out; block in, block out; a
key that did not exist before gets written as a block list**, which is the stated preference and
the safe default.

This is not extra machinery. The span the writer is handed (§5) already says whether the value
ended on its own line or ran on to others. The shape is in the span, not in a separate decision.

**Multi-line lists are preserved by construction**, which was the stated requirement. The only
way to lose them is to rebuild the block from parsed values, and §5 of the types plan already
forbids that.

### 4.2 Flow lists are easier to splice, not harder

A flow list's value ends where its line ends. There is nothing to work out. **The block list is
the awkward one**: its end is "the first following line that is not a deeper-indented item", a
rule that has to agree exactly with the parser's own or the writer damages the file. That is the
argument for §5, and it exists whether or not flow lists are supported.

What flow lists do cost is one addition to the quoting rule in step 7 of the types plan: a text
value that begins with `[` must be quoted, or it reads back as a list. And an item written *into*
a flow list must be quoted if it contains a comma or a bracket. Two lines in a function that has
to exist anyway.

**So flow lists are a yes.** The thing that would genuinely restrict editing is not a syntax at
all — it is a parser whose idea of where a value ends lives somewhere other than the writer's.

---

## 5. The reverse direction — should it be the same code?

**Yes, and the cheapest way is the pattern this file already uses.**

`parseYaml(yamlString, errors)` takes an array it fills in as a side channel. Add a second one:

```js
parseYaml(yamlString, errors, spans)
```

where `spans` is an optional Map the caller passes in, filled with `key → { valueStart, valueEnd,
inline }` as character offsets into the original text. Omit it and nothing is recorded — one
`if (spans)` per key line, which is not measurable. Pass it and you get every key's exact splice
range from the same walk that produced the values.

**The argument for tying them is correctness, not convenience.** A separate locator would need
its own rules for where a block list stops, where a nested key's children end, which lines are
comments. Two implementations of that will agree on the day they are written and drift
afterwards, and the drift is not a wrong display — it is a write into the wrong bytes of
somebody's note. There is one definition of where a value ends, and it should exist once.

**It is also nearly free to build**, given the §2 rewrite. A parser that walks the raw string with
`indexOf` instead of splitting it into an array is already holding the character offsets. Today's
parser cannot do this at all: it threw the offsets away the moment it called `split`.

**This is the load-bearing argument for §7.1, not the 10%.** §2.3 is honest that the speed saving
alone would not justify the churn. What justifies it is that a splice needs character offsets, a
split destroys them, and so the parser has to stop splitting before anything can be written back.
They are one piece of work, and the speed is what falls out of it.

Two things this deliberately does not try to be:

- **Not a writer.** `spans` says where to splice. Deciding what text to splice in is the type
  system's job and lives in the types plan.
- **Not a partial parse.** Locating one key still walks the whole block. At 2.5 µs for a single
  edit that is not worth one line of cleverness.

---

## 6. Other things worth fixing while in here

Found the same way as §0 — by running the parser, not by reading it.

### 6.1 A setext heading can swallow the top of a note

`yaml-find.js` allows the opening `---` on any of the first five lines. A note written with
underlined headings starts:

```
My Title
---

Some body text.

Another section
---
```

The underline on line 2 is read as the start of a front matter block, the next `---` closes it,
and the two paragraphs between become front matter. The note is flagged `yaml: 2 lines skipped`,
and — worse — `replaceFrontMatter` then deletes those paragraphs from the rendered view. Confirmed
by running it: the rendered source comes back as `My Title\n[PROPS]\n\nmore text`.

The comment in `yaml-find.js` shows the line-0 requirement was removed deliberately, so this
should be tightened rather than reverted: **allow the opening `---` only at line 0 or preceded
solely by blank lines.** That keeps whatever the allowance was for and stops a heading claiming
the block.

### 6.2 The empty placeholder object

Already written up as step 1 of the types plan and still the best ratio of benefit to risk in
either document. A key whose nesting never arrived should store nothing rather than `{}`. Worth
restating here because it belongs to the parser, not to types.

### 6.3 Keys landing on an array

Front matter like this:

```yaml
items:
  - name: a
    id: 1
```

sets `id` as a property **on the array object**, where it is invisible to everything downstream
and to `JSON.stringify`. Lists of objects are out of scope for this parser, which is fine — but
silently writing onto an array is not. One `Array.isArray` check on the target scope, recording
an error instead, costs nothing per line.

### 6.4 The dash-and-colon line

§0's bug 3. `- apple: red` is checked for a colon before it is checked for a dash, so the key
becomes the literal text `- apple` and **no error is recorded**. Checking for the dash first
fixes the mangling; the item then reads as the string `apple: red`. Recording an error as well is
the honest finish, since a list of objects is not something this parser supports.

### 6.5 `Infinity` coerces to a number

`coerceValue` runs `Number()` on every unquoted value, so `note: Infinity` becomes the numeric
`Infinity`. The first-character fast-reject in §7.2 removes this as a side effect, which is the
better outcome on both counts.

---

## 7. Other ways of making it faster

### 7.1 The ones worth doing

All three are the same idea: stop touching the body of the note. Together they are §2.3's 10% to
15% of load, and — the actual reason to do them — the shape the reverse direction in §5 needs.

1. **Find the block with `indexOf`, not `split`.** §2.2's table. The largest of the three, and
   the only one that enables anything.
2. **Stop after five lines when looking for the opening separator.** The rule already says the
   block must start there. Currently a file with no front matter is scanned to its last line
   before that rule is applied.
3. **Compute the bounds once per file and pass them down.** `file-info.js` already has the
   indices before it calls `parseYaml`, which then works them out again from scratch. Same for
   `parse-content.js`, which finds them, then calls `replaceFrontMatter` which finds them again,
   and `renderFrontmatterProperties` which finds them twice more. Threading one result through is
   less code than the duplicate calls it removes.

**On the render path, `replaceFrontMatter` can then stop splitting too**, since two `slice` calls
around the block's character offsets do what splitting, splicing and joining an array of lines
currently does. That is tidiness rather than speed — the render path handles one file on a click
— but it removes the last place that splits a whole file to touch a dozen lines.

### 7.2 The one that is marginal, and worth it only for the bug it fixes

**Reject a number by its first character before calling `Number()`.** A value can only be a
number if it starts with a digit, `-`, `+` or `.`. Measured over a realistic mix of ten front
matter values: 0.162 µs for the batch as it stands, 0.097 µs with the fast reject. Around 6 ns
per value, so **roughly 2% of a parse — not a reason to do it on its own.** Do it for §6.5, and
take the 2%.

### 7.3 The ones not worth doing

Written down so they are not rediscovered and tried.

- **Hand-rolled trimming instead of `line.trim()`.** Measured at 12 ns per line against 9 ns.
  Three nanoseconds a line, for indices to carry through the whole function. No.
- **Regex instead of the character loop.** The loop is already faster than the regex engine's
  setup for work this small, and far easier to read.
- **Caching parse results by file content.** The parser is about to cost a microsecond. A cache
  key would cost more than the thing it caches, and cache invalidation is a whole new way to show
  someone stale data.
- **Parsing lazily, on first access.** Every loaded file's front matter is read immediately for
  property registration and the table, so nothing would ever stay unparsed.

---

## 8. What this adds up to

The parser gets **smaller in behaviour and simpler in shape**, not larger:

- one walk over the front matter region, never over the note
- one definition of where a value ends, serving both reading and writing
- three shapes it used to reject that it now accepts, two of which cost no code at all
- four silent failures that start reporting themselves

The added code is the flow-list scan (~15 lines), the dash-first reordering (a moved branch), the
`spans` out-param (a handful of lines), and three small error cases. Against that, the
`getFrontMatterLines` indirection goes away entirely and the duplicate bounds calls go with it.

**Speed is not the headline, despite §2 being the longest section.** The parser's share of a
folder load is 10% to 15%, and §2.3 names the two things that are bigger. What this buys is a
parser that accepts the front matter people actually write, says so when it cannot, and holds the
character offsets that writing a value back requires. The 10% comes along with it.

---

## 9. Steps

Each finishable and checkable on its own. Bump the manifest minor version on each one.

The existing fixtures in `tests/helpers.js` were checked against the prototype before this was
written: `broken-yaml.md`, `half-broken.md` and `clean-yaml.md` all produce the same values and
the same error counts, so `tests/29-yaml-load-errors.spec.js` passes unchanged through every step
below. That is a deliberate property to keep, not luck — if a step changes those counts, the step
is wrong.

### Step 1 — Stop the parser leaving empty placeholder objects behind

Unchanged from step 1 of the types plan; §6.2. Smallest change here, stands entirely alone, and
turns every failure in §0 from `[object Object]` into a blank cell plus the error already being
recorded.

### Step 2 — Replace the bounds finder

A `findFrontMatterBounds` that walks the raw string, stops at five lines if no opening separator
has appeared, and returns **both** the line indices the current callers need **and** the character
offsets of the block body. Tighten the opening-separator rule per §6.1 in the same step, since it
is the same function and the same test.

**Care needed:** `parse-content.js` and `marked-source-tracking-renderer.js` depend on the line
indices for diff highlighting. Those must keep meaning exactly what they mean now.

### Step 3 — Parse from the bounds instead of from a split file

`parseYaml` takes the block from the bounds and walks it. `getFrontMatterLines` and its module go
away. Thread the already-computed bounds through from `file-info.js` and `parse-content.js` per
§7.1 item 3.

**No behaviour change in this step**, and it is the step whose payoff is easiest to overstate:
it buys about 10% of a folder load (§2.3) and the character offsets step 8 cannot be built
without. Its test is that everything else still passes.

`replaceFrontMatter` can lose its split in the same step, per §7.1. It is the only caller that
genuinely removes and reinstates the block, and two `slice` calls do it.

### Step 4 — Fix the dash line

Recognise a dash item before looking for a colon, and let it keep the key context it belongs to.
Delivers flush lists (§3.1) and §6.4 together, because they are the same branch.

**Care needed:** this touches the same stack logic that handles nesting. Nested keys, lists inside
maps, and a key following a list all need checking before and after.

### Step 5 — Tabs

The one-character change in §3.3, plus the error for a key landing on an array (§6.3), which is
where a mis-indented file most often ends up.

### Step 6 — Flow lists

§3.2, including the error on an unbalanced bracket.

### Step 7 — The first-character number reject

§7.2 and §6.5 together.

### Step 8 — The `spans` out-param

§5. Nothing consumes it yet. Build and test it on its own, before anything writes through it —
a bug here damages files. This is step 8 of the types plan arriving from the other direction, and
it replaces that step rather than sitting beside it.

### Step 9 — Tests

Fixtures for each accepted shape, each recorded error, and the setext note in §6.1. Worth a
fixture per row of §0's table specifically, since that table is the reason this plan exists.

---

## 10. Conventions to hold to

- **No new dependency, no new syntax the app does not use.** Every shape added here is one that
  real notes in real folders already contain.
- **The parser stays one file.** It is currently three modules for one job; §9 makes it one. That
  is the direction of travel, not a new folder.
- **Every rejection records a reason.** The forgiving behaviour is right, but silence is not —
  four of the faults in this document were invisible, and the invisible ones cost the most.
- **The parse loop stays readable.** §7.3 exists so that a future reader does not trade clarity
  for nanoseconds. The speed came from doing less work, not from writing denser code.
