# Plan: what the front matter parser should be

Branch: `claude/yaml-parser-improvements-yelc0o`
Manifest version now: `1.176.0` → bump the minor version with each step that changes code.
Related: `plans/table-value-types-and-editing.md`, which this was split out of and which depends on it.

Status: **built.** Every step in §9 is done, and §11 records where the code differs from what
this plan said it would be.

**§0 is lifted unchanged from §4 of the types plan**, which is where these bugs were first
written down. Everything after it is the design discussion that followed.

**Read §2.3 before §7.** This started as a plan to make the parser faster. Measured in the real
app, the whole YAML path is under 3% of a folder load, and most of the speed work was declined in
§7 on readability grounds. What was built is a correctness change.

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
being asked for costs nothing — and, less comfortably, that the parser is not where a folder load
spends its time at all, so the second rule turns out to constrain far less than it looked like it
would.

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

**This prototype is not recommended, and §7.3 says why.** The table is kept because it is the
measurement that has to be weighed against readability, and because it is what §2.3 goes on to
put in proportion. Read both before judging it.

### 2.3 In the real app, none of it registers

**Everything above is measured in isolation, and measuring it in isolation is what made it look
important.** Run the load path as the app actually runs it — in Chromium, against real files,
serially, the way `directory-handler.js` awaits one file at a time — and the picture inverts.

| | 500 notes of 4KB | 200 notes of 40KB |
|---|---|---|
| whole load, `getFileDataAndMetadata` per file | 527 ms | 285 ms |
| of that, `getFile()` + `text()` | 381 ms — 72% | 197 ms — 69% |
| of that, the entire YAML path | 4.5 ms — **0.9%** | 8.0 ms — **2.8%** |
| of that, `getContentPeek`'s split | 1.6 ms — 0.3% | 3.4 ms — 1.2% |

**The bottleneck is the File System Access API, and it is not close.** `directory-handler.js`
awaits `getFileDataAndMetadata` one file at a time, and each of those awaits `handle.getFile()`
and then `file.text()`. Two round trips per file, serialized. That is roughly 70% of the load,
and this measurement is against OPFS, which is about the fastest backing store the API has — a
real folder, especially a cloud-synced one, is slower still.

So the honest size of the prize: **deleting every split discussed in this document saves about
6 ms of a 527 ms load.** Nobody will ever see it.

Two corrections to the earlier drafts of this section, both worth keeping visible so the mistake
is not made a third time:

- An earlier version claimed the rewrite makes the load path stop scaling with file size. It does
  not. The title, tag and link `matchAll` in `parseFileContent` is genuinely O(body) and has to
  be, since a tag can appear anywhere in a note.
- An earlier version put the YAML path at 11–19% of load. That was a Node micro-benchmark with
  no I/O in it. With the I/O that the real loop cannot avoid, it is 1–3%.

**If speed were the only argument in this document, the answer would be to close it and do
nothing.** §7 is written on that basis.

### 2.4 What the syntax costs

Nothing, which is now the only speed figure here that matters. **The prototype behind every
number above already supports flush lists, flow lists and tabs.** They add about twenty lines and
do not register against a load that is 70% file I/O. Whatever is decided about §7, **§3 and §6
are not a speed question at all** and should not be argued as one.

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

This is not extra machinery, and §5.3 is why: the writer copies the indentation and separators
out of the items already in the file rather than choosing them. **A flush list stays flush and an
indented one stays indented because nothing anywhere ever decides which to use.** The shape is in
the span, not in a rule someone has to remember.

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

where `spans` is an optional Map the caller passes in. Omit it and nothing is recorded — one
`if (spans)` per key line, which is not measurable.

**The argument for tying them is correctness, not convenience.** A separate locator would need
its own rules for where a block list stops, where a nested key's children end, which lines are
comments. Two implementations of that will agree on the day they are written and drift
afterwards, and the drift is not a wrong display — it is a write into the wrong bytes of
somebody's note. There is one definition of where a value ends, and it should exist once.

**And it does not need the rewrite in §7.1.** An earlier draft argued that it did — that a split
throws away the character offsets a splice needs, so the parser had to stop splitting first. That
is wrong, and it was the last argument propping up the speed work.

The offsets can be carried alongside the existing `split("\n")` with a running counter:

```js
const lineStart = offset;
offset += line.length + 1;
```

Three lines. Prototyped and checked, including a splice of a multi-line list and a CRLF file:
`tags` in a four-line block comes back with the span `"\n  - web\n  - prod"`, and replacing it
produces exactly the intended text with every other byte untouched. `split("\n")` is safe for
this because it is the only split that preserves length exactly — a `\r` stays on the end of the
line and counts. `split(/\r?\n/)` would not be.

**So §5 can be built on today's parser structure.** That is the right thing to know before
deciding §7, and it is why §7 now recommends against most of itself.

### 5.1 A whole-value span is not enough, and lists are why

The obvious shape is `key → { valueStart, valueEnd }`: where this key's value begins and ends.
That is right for a scalar and **wrong for a list**, because the thing being edited is usually one
item, not the whole list. Replacing the whole span to change one item means regenerating the other
items, and regenerating them means deciding how they are written — indented or flush, quoted or
not — which is a decision the file has already made and the writer has no business remaking.

So each entry carries the form it was written in and, for a list, one span per item:

```js
{
  valueStart, valueEnd,      // the whole value, for replacing or clearing it outright
  form: 'scalar' | 'block' | 'flow',
  items: [ { lineStart, valueStart, valueEnd } ]   // lists only
}
```

An item's `valueStart` points **past the dash and the space**, so an item's span is the value
alone. Editing one item is then a splice into that span and nothing else moves.

### 5.2 What this buys, on a real block

Prototyped against this front matter:

```yaml
tags:
  - web
  # a comment inside the list
  - prod
```

`tags` comes back as `form: 'block'` with a whole-value span of `"\n  - web\n  # a comment inside
the list\n  - prod"` and two item spans, `"web"` and `"prod"`. Editing `tags[1]` produces a file
identical to the original but for the four characters that changed. **The comment between the
items survives**, which a whole-value rewrite would have destroyed without ever noticing it was
there.

### 5.3 Inserting an item, without deciding anything

This is the part that answers "there are different ways to write a multi-line list now". **The
writer never has to know which way this file used.** Each item carries `lineStart`, so the text
between `lineStart` and `valueStart` is that item's own prefix — `"  - "` in an indented list,
`"- "` in a flush one — and inserting is:

```js
text.slice(0, last.valueEnd) + "\n" + text.slice(last.lineStart, last.valueStart) + newItem + text.slice(last.valueEnd)
```

**The indentation is copied, never chosen.** A flush list stays flush, an indented one stays
indented, and a list indented by a tab stays indented by a tab, with no code anywhere that knows
those are different. Flow lists take the same trick with the separator between two existing items
instead of the line prefix.

This is what makes §4.1's "preserve the shape you found" a property of the data rather than a rule
somebody has to remember to implement. **That is the real reason to put item spans in.**

### 5.4 What it does not cover

- **A key whose value is a nested map.** The span covers the whole nested block. Editing inside it
  from a table cell is out of scope — the table shows flat properties — and the lock in §5.2 of
  the types plan is what stops it being attempted.
- **An empty list.** There are no items to copy a prefix from, so adding the first item to a
  `tags:` with nothing under it does need a default. Block form, indented two spaces, matching
  what the app writes elsewhere. It is the only place a style gets chosen, and it is the only
  place where there is nothing to copy.

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

The comment in `yaml-find.js` shows the line-0 requirement was removed deliberately, so this has
to be tightened without losing what the allowance was for. **A rule of "line 0, or blank lines
only above it" is too strict**, because this is a shape people write and it should keep working:

```md
# my title
---
day: Monday
---
```

**Two conditions instead, both cheap, and neither sufficient on its own.**

**1. What may sit above the opening separator: blank lines and ATX headings only.** This is not an
arbitrary allowance — in markdown a `---` cannot underline a heading, only a paragraph. So a
`---` after `# my title` is unambiguously not a setext underline, while a `---` after `My Title`
is exactly that. The rule follows the markdown, and the five-line bound stays.

**2. When something does sit above it, the block must contain something that reads as front
matter.** At least one line that parses as a key, or as a list item. A block of prose between two
horizontal rules contains neither.

**Condition 2 applies only when condition 1 had something to allow.** A separator on the very
first line has nothing above it to be a break between, so a block opening there is taken at its
word however badly it is written — which is what keeps a file whose front matter is entirely
unparseable recognised, and reported, rather than quietly read as prose. See §11 item 6: writing
this the other way round broke an existing test, and that is how the distinction was found.

Checked against the old behaviour:

| | old | new |
|---|---|---|
| `---` at line 0 | found | found, condition 2 not consulted |
| `---` at line 0, nothing in it parses | found | found, and still reported |
| `# my title` then `---` | found | **found** |
| blank line then `---` | found | found |
| setext heading trap | found — the bug | **rejected**, by condition 1 |
| `# Title`, rule, prose, rule | found — the same bug | **rejected**, by condition 2 |
| all three fixtures in `tests/helpers.js` | found | found, same error counts |

Condition 2 is what keeps condition 1 from having to be strict. It is also why `broken-yaml.md`
still works: it has one line that parses, `title: Broken Note`, so the block is recognised and the
two lines that do not parse are recorded as errors exactly as they are today. **Recognising a
block and parsing it cleanly stay separate questions**, which is the property that keeps the
forgiving behaviour intact.

**One case both rules still miss**, recorded rather than fixed: a note with a heading, a
horizontal rule, a line containing a colon, and a second horizontal rule — `Note: this is
important` between two rules is read as front matter. It is no worse than today and it is narrow.

If it ever bites, the cheap extra condition is to **require the line immediately after the opening
separator to be non-blank**, since a thematic break is usually followed by a blank line and real
front matter is not. That is one more comparison and it removes this case entirely. It is not
recommended up front, because it would reject a valid block written with a blank line after the
opening `---`, and silently losing someone's real front matter is the worse of the two failures.

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

## 7. Other ways of making it faster, and whether to bother

**Recommendation: mostly no.** §2.3 measured the whole YAML path at 0.9% to 2.8% of a real folder
load, against 70% spent waiting on the File System Access API. §5 then removed the one non-speed
argument that was carrying this section. What is left is genuine but small, and some of it costs
readability, which this codebase values more than microseconds.

Judged one at a time rather than as a block.

### 7.1 Do it — because it is a correctness fix that happens to be faster

**Bound the search for the opening separator to the first five lines.** `findFrontMatterIndices`
uses `findIndex` over every line in the file, then rejects the answer if it turns up after line
5. That is already being changed for §6.1, where the same loop has to stop a setext heading
claiming the block. Once it is a bounded loop, a file with no front matter stops being scanned to
its last line for free.

**Verdict: yes, but file it under §6 rather than here.** It is being done anyway and the speed is
incidental.

### 7.2 Do it — because it removes duplicated work, not because it is fast

**Compute the front matter bounds once and pass them down.** `file-info.js` finds the indices,
then calls `parseYaml`, which finds them again from scratch. `parse-content.js` finds them, calls
`replaceFrontMatter` which finds them again, and `renderFrontmatterProperties` which finds them
twice more. **Five calls per render where one would do.**

**Verdict: yes, on clarity grounds.** Someone reading `parse-content.js` cold currently has to
work out whether those calls can disagree with each other. They cannot, but having to check is
itself the cost. The saving is a fraction of the 0.9%.

### 7.3 Don't — the `indexOf` rewrite

**Replacing `split` with a walk over the raw string.** This was the centrepiece of the first two
drafts. It is 7× to 48× faster at finding the bounds, and that is worth **about 5 ms on a 527 ms
load.**

Against it:

- It costs readability. `lines.findIndex(line => line.trim() === '---')` says what it does at a
  glance. A hand-rolled scanner with `indexOf`, offset arithmetic and its own separator
  comparison does not, and this codebase's stated aim is that any file can be understood cold in
  a minute.
- Its one non-speed justification is gone. §5 shows the spans can be had for three lines on top
  of the existing structure.

**Verdict: no.** If the app ever loads folders where this is felt, the fix is to stop awaiting
files one at a time, not to stop splitting strings.

### 7.4 Don't — `getContentPeek`

Added here at request, since it was found while measuring the above and it is the same shape of
mistake.

`getContentPeek` in `file-info.js` runs `fileContent.split(/\r?\n/)` on the whole file, then
reads lines until it has about 130 characters. **It splits a 40KB note into roughly 550 strings
to look at three of them.** `getInitialTitle` does the same on the path where a note has no H1.

Measured in Chromium over the same files as §2.3:

| | 500 notes of 4KB | 200 notes of 40KB |
|---|---|---|
| the split as it stands | 1.6 ms — 0.3% of load | 3.4 ms — 1.2% of load |
| a walk that stops at 130 characters | 0.3 ms | 0.1 ms |

**Verdict: no, and this one is the clearest no in the document.** It would save about 3 ms on a
folder that takes 285 ms, and the replacement is harder to read than the thing it replaces: the
current function is a plain loop over an array of lines, and a character walk with its own
newline arithmetic is not. **A 1% saving is not worth making a readable function less readable.**

Worth recording rather than acted on. If `getContentPeek` is ever touched for another reason,
the bounded walk is what it should become, and the figures are here.

### 7.5 Do it — but only for the bug

**Reject a number by its first character before calling `Number()`.** A value can only be a
number if it starts with a digit, `-`, `+` or `.`. Around 6 ns per value, roughly 2% of a parse
that is itself 1% of load — **which is to say, nothing at all.**

**Verdict: yes, for §6.5.** `note: Infinity` currently becomes the numeric `Infinity`, and the
first-character check is the tidiest way to stop it. Three lines, and the speed is a rounding
error on a rounding error. Do not describe it as an optimisation.

### 7.6 Don't — the rest

Written down so they are not rediscovered and tried.

- **Hand-rolled trimming instead of `line.trim()`.** Three nanoseconds a line, for offset indices
  to carry through the whole function.
- **Regex instead of the character loop.** Already slower at this size, and harder to read.
- **Caching parse results by file content.** The parse is 9 µs a file. A cache key would cost
  more than the thing it caches, and cache invalidation is a new way to show someone stale data.
- **Parsing lazily.** Every file's front matter is read immediately for property registration and
  the table, so nothing would stay unparsed.

### 7.7 Where the time really is, if it ever matters

Not this plan's to fix, but this is where the measurement points and it should not be lost.

`directory-handler.js` awaits `getFileDataAndMetadata` one file at a time, and each call awaits
`handle.getFile()` then `file.text()`. **Two serialized round trips per file, about 70% of the
load.** Reading in batches with `Promise.all` over a window of files is where a folder load would
actually get faster, by a lot more than everything in this section combined.

It is a bigger and riskier change than anything here — it touches ordering, the progress
indicator and the unreadable-file handling — and it belongs in its own plan. **But if the reason
for reading this section was "make loading faster", that is the plan to write instead.**

---

## 8. What this adds up to

**This stopped being a performance plan somewhere in §2.3.** What survives is a correctness plan
with a small amount of new syntax, and it is better for the loss.

What gets built:

- three shapes the parser used to reject and now accepts — flush lists, flow lists, tabs — of
  which two need no code aimed at them at all
- four silent failures that start reporting themselves
- one piece of data loss fixed, where a setext heading eats the top of a note, without losing the
  `# my title` then `---` shape that should go on working
- character offsets for every key and every list item, which is what lets a cell edit rewrite one
  value — or one item of a list — and leave every other byte of the file alone, comments between
  list items included

What does not get built, having been measured: the `indexOf` rewrite, the `getContentPeek` walk,
and every micro-optimisation in the parse loop. §7 has the numbers and the reasoning for each.

**Net code:** roughly plus fifty-five lines. The flow-list scan is about fifteen, the spans and
their item detail about fifteen, the error cases about ten, the block-detection conditions about
six, and the rest is a moved branch and a few characters. Nothing is
deleted, which an earlier draft promised and §7.3 has now withdrawn.

**The parse loop keeps its shape.** It still splits the block into lines and walks them, because
that is the version a person can read.

---

## 9. Steps

**All done**, in one change rather than nine, at manifest version `1.177.0`. Kept as written so
the order of reasoning survives; §11 says what came out differently.

The existing fixtures in `tests/helpers.js` were checked against the prototype before this was
written: `broken-yaml.md`, `half-broken.md` and `clean-yaml.md` all produce the same values and
the same error counts, so `tests/29-yaml-load-errors.spec.js` passes unchanged through every step
below. That is a deliberate property to keep, not luck — if a step changes those counts, the step
is wrong.

### Step 1 — Stop the parser leaving empty placeholder objects behind ✅

§6.2, and unchanged from step 1 of the types plan. A key whose nesting never arrived stores
nothing rather than `{}`. Smallest change here, stands entirely alone, and turns every failure in
§0 from `[object Object]` into a blank cell plus the error already being recorded.

### Step 2 — Tighten where the front matter block may start ✅

§6.1, which is two conditions: only blank lines and ATX headings may sit above the opening `---`,
and the block must contain at least one line that reads as a key or a list item. Make the search
a bounded loop rather than a `findIndex` over the whole file (§7.1) in the same step.

**`# my title` followed by `---` must keep working** — it is a shape people write, and it is the
reason the rule is two conditions rather than a position test.

**This is the data-loss fix**, not a speed step: a note using setext-underlined headings
currently has its first two paragraphs read as front matter and deleted from the rendered view.

**Care needed:** `parse-content.js` and `marked-source-tracking-renderer.js` depend on the line
indices for diff highlighting. They must keep meaning exactly what they mean now.

### Step 3 — Compute the bounds once ✅

§7.2. Thread one result through `file-info.js` and `parse-content.js` instead of recomputing it
up to five times per render. **A clarity step with a speed side effect too small to mention.**

### Step 4 — Fix the dash line ✅

Recognise a dash item before looking for a colon, and let it keep the key context it belongs to.
Delivers flush lists (§3.1) and §6.4 together, because they are the same branch.

**Care needed:** this touches the same stack logic that handles nesting. Nested keys, lists inside
maps, and a key following a list all need checking before and after.

### Step 5 — Tabs ✅

The one-character change in §3.3, plus the error for a key landing on an array (§6.3), which is
where a mis-indented file most often ends up.

### Step 6 — Flow lists ✅

§3.2, including the error on an unbalanced bracket.

### Step 7 — The first-character number reject ✅

§7.5 and §6.5 together. Filed as a bug fix, not an optimisation.

### Step 8 — The `spans` out-param ✅

§5, built on the existing split with a running offset. Nothing consumes it yet. Build and test it
on its own, before anything writes through it — a bug here damages files. This is step 8 of the
types plan arriving from the other direction, and it replaces that step rather than sitting
beside it.

**Include the per-item spans for lists from the start** (§5.1). They are a few lines more than a
whole-value span and they are what lets one item be edited without regenerating the others. Test
them on a list with a comment between two items, which is the case that proves the point.

### Step 9 — Tests ✅

Fixtures for each accepted shape, each recorded error, and the setext note in §6.1. Worth a
fixture per row of §0's table specifically, since that table is the reason this plan exists.

Built as `tests/44-yaml-parser.spec.js`, sixteen tests. The first covers all four rows of §0's
table in one assertion, since all four now produce the same list. `setupMockFilesYamlShapes` in
`tests/helpers.js` backs the one test that loads a folder rather than calling the parser, so the
new shapes are checked as properties on a file object and not only as a return value.

### Not a step — the speed work

§7.3, §7.4 and §7.6, all measured and all declined. §7.7 names the change that would actually
make loading faster, and it is not in this plan.

---

## 10. Conventions to hold to

- **No new dependency, no new syntax the app does not use.** Every shape added here is one that
  real notes in real folders already contain.
- **Every rejection records a reason.** The forgiving behaviour is right, but silence is not —
  four of the faults in this document were invisible, and the invisible ones cost the most.
- **Readability beats microseconds, and §7 is the worked example.** Three proposals were dropped
  after being measured, including the one this plan was originally built around. A change that
  makes a function harder to read needs a reason other than speed, and on this load path — 70% of
  which is waiting on the file system — speed is almost never that reason.
- **Measure in the app, not in isolation.** Every wrong number in the drafts of this plan came
  from benchmarking a function on its own. The figures that changed the recommendation came from
  running the real load path in a real browser.

---

## 11. What came out differently

Five places where the build departed from what is written above. All small, all found by writing
the code or the tests rather than by rereading the plan.

**1. There are four forms, not three.** §5.1 lists `scalar | block | flow`. A key whose value is a
nested map needed its own, or a writer would read `form: 'scalar'` and splice into the middle of
a block. It is `map`, and §5.4 already said such a span covers the whole nested block — the form
list simply did not mention it.

**2. `yaml-block-extract.js` is gone.** §8 says "nothing is deleted", written when §7.3 withdrew
the `indexOf` rewrite. But step 3 hands `parseYaml` the bounds it used to go and find, and the
module's only remaining job was to split the file a second time and slice out the lines. It had
no work left. Three modules for one job are now two.

**3. The unclosed-bracket error needed narrowing.** §3.2 says a value opening with `[` that does
not close should report itself. Implemented literally, `note: [draft] needs work` — ordinary prose
with a bracketed word in it — was flagged on every load. The error now fires only when there is no
`]` anywhere in the value, which distinguishes a broken list from a sentence.

**4. Spans are recorded for top-level keys only.** The plan never said otherwise but never said
so either. Nested keys share names across files and the table shows flat properties, so a nested
key's span would be a name collision with nothing to use it. The top-level key's span covers the
whole nested block, per §5.4.

**5. Spans describe the text, the returned object describes what was understood.** These differ
in one case: step 1 prunes a key left holding an empty map, but its span stays. That is the right
way round — the key is in the file, so an editor should be able to write into it — but it is a
distinction the plan did not anticipate and the JSDoc now states.

### Two things worth knowing that the plan got right

**The scalar span starts immediately after the colon; an item span starts after the dash and its
whitespace.** That asymmetry is deliberate and it is not a wrinkle: a scalar span is the whole
value slot, so the writer supplies the separating space, while an item span is the value text
alone. Both are what their own job needs.

**Tabs cost one comparison, as predicted.** The indent loop accepts tab alongside space and
nothing else in the parser knows tabs exist. A tab-indented list, a tab-indented key, and an
insert into a tab-indented list all work, the last because the prefix is copied rather than
chosen.

### Speed, measured after the fact

A/B against the previous implementation on identical input, same process, same run:

| | old find + parse | new parse |
|---|---|---|
| 4KB note | 41.3 µs | 27.9 µs |
| 40KB note | 98.5 µs | 61.6 µs |
| 40KB note, no front matter | 66.0 µs | 36.7 µs |

Roughly 1.5× to 1.8×, from dropping one of three whole-file splits and bounding the two scans.
**Per §2.3 this is about 1% of a folder load**, which is why it was never the reason to do any of
this. The absolute figures are higher than §2.2's because the machine was busy; only the ratio
between the two columns means anything.

**6. The content test applies only below line 0.** Written as an unconditional rule, it regressed
`tests/35-broken-links.spec.js`. The fixture `both-faults.md` opens `---` on the first line with a
single unparseable line inside it, deliberately, to produce a yaml error and a link error at once.
The new rule read that block as prose, so the yaml error vanished and the nudge it feeds
disappeared with it.

**The fix is a better rule, not an exception to it.** The content test exists to break a tie about
what a `---` means, and there is no tie on the first line: nothing precedes it, so it cannot be a
thematic break or a setext underline. A file that opens with `---` is claiming front matter, and
the right response to a block that then fails to parse is to report it, which is what the app
already did well. Every trap in §6.1 sits below line 0 and is still rejected.

**Worth noting how it was found.** Not by rereading the plan — by the existing suite. The rule as
written in §6.1 looked right in the plan, in the prototype, and in sixteen new tests, all of which
tested shapes the rule was designed around. The fixture that caught it was written for something
else entirely.
