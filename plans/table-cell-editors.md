# Plan: what opening a table cell gives you

Status: **not built**, beyond what §1 lists as already there.
Branch: `claude/table-view-types-arch-4yhgmf`
Manifest version now: `1.191.0` → bump the minor version with each step that changes code.
Depends on: `plans/completed/table-value-types.md`, **built**.
Paired with: `plans/table-cell-writing.md`, which takes what comes out of here and puts it in the
note. **This plan comes first**: it decides the shape of what the writing side receives.

A cell is a `contenteditable` div today — one editor for everything, never argued for, just
inherited. This plan decides what a click on an editable cell actually opens, per type, and whether
anything is done to what the user typed before it is handed on.

---

## 1. What a cell already does

`cell-expand.js` owns it. One click selects, a second expands, a third collapses. The two steps
exist because cells hold their own clickable things — tag pills, the open button, internal links —
and a single click would compete with them.

An expanded cell is taken out of flow and grows downward only, so the row keeps its height and every
column keeps its width. It is `contenteditable="plaintext-only"`, which keeps pasted markup out.
Nothing is saved: edits live in the DOM and are discarded by the next render.

**Two cases already refuse a caret**, both from the types plan:

- **A cell whose value does not fit its column.** It opens so the value can be read, says why in the
  cell and in its tooltip, and offers no editor. `typeMismatch()` is the test.
- **The file column**, whose cell is an open-file link rather than a value at all.

So "opening a cell does not always mean editing it" is established, and the thing this plan adds is
what the *other* outcomes are.

---

## 2. The question, and why lists settle most of it

| type | what opening the cell should give you | settled? |
|---|---|---|
| text | the cell, as now | yes — nothing else would help |
| number | the cell, as now | yes — the writing plan accepts and quotes bad input |
| list | one item per line — §3 | yes, and it is the reason this plan exists |
| date | the cell, or a date control — §4 | **the open decision** |

**Lists are what force the issue.** Several values cannot be expressed in a cell that stands for
one, so there will be at least one editor that is not the default. The question stopped being
whether to have per-type editors and became how many.

**That is a fourth switch on the type**, and the types plan named this as the moment to notice. It
argued for three — the sort comparator, the cell renderer, the value writer — and refused a registry
per type, because HTML-producing and file-writing code should not share an object. The editor is
DOM-producing, so it sits with the renderer rather than with the writer, and the refusal still
holds: **four small switches in four obvious places, not one clever object.**

---

## 3. The list editor

**One item per line in the expanded cell.** That is the whole design.

Four reasons it is the right shape rather than a compromise:

- the expanded cell already grows downward without limit, which is exactly what a list needs
- `plaintext-only` already handles Enter, so multiple lines cost nothing
- one item per line is what a block list already looks like in the file, so what you see and what
  is written are the same arrangement
- it sidesteps what a comma-separated box would have to say about an item containing a comma

**Reading out:** split on newlines, trim, drop empty lines. That is the value the writing plan
receives — an array of strings, in order.

**Reading in:** the items, one per line, in the order the file has them. A Map (which is only ever
the tag map) never reaches here, because tags is not editable.

**What it does not do:** reordering by dragging, an × per item, an explicit add button. All three
are a pill editor, which is a different and much larger piece of work. Typing is enough, and if the
plain version turns out to be annoying in use that is the moment to know what to build instead.

---

## 4. The date decision

**This is the one thing in this plan that is genuinely open**, and the writing plan cannot be built
until it is settled, because it decides whether a transformation exists at all.

The writing side is told to produce a plain ISO date. From what? Someone types `1 March 2026` into a
date column and there are two honest answers and no rule:

| option | what happens | the cost |
|---|---|---|
| **the plain cell, and transform** | the app reads what was typed and writes `2026-03-01` | the app has silently rewritten the user's words, in a system whose founding rule is that it does not reinterpret notes |
| **the plain cell, and no transform** | `1 March 2026` is written as typed | honest, but the ordinary act of typing a date produces a cell immediately marked as unreadable |
| **a date control** | what comes back is already ISO | one more editor to build; and a control cannot express "about March", which typed text can |

**A date control removes the question rather than answering it.** The writer has nothing to decide
and the user has nothing to get wrong. That is the recommendation, with the last column's caveat
stated plainly: a date column becomes a column of real dates only, and anyone wanting to write
"about March" needs the column to be text.

**If the control is chosen, this plan contains the only transformation in the feature** — and it is
not really a transformation, it is a control that cannot produce anything else. If the plain cell is
chosen, the transformation question moves to the writing plan and has to be answered there.

---

## 5. Where the choice lives

**Not in `cell-expand.js`.** Its job is selecting, expanding and collapsing, and it should stay that
size. It asks what to open and does it.

One new module owns the answer: given a cell's property and its column's type, what does opening it
give you — the plain cell, the list editor, a date control, or nothing at all because the value does
not fit or the property is not editable. That is the same shape as `property-type.js` answering
"what type is this column", and it is what the writing plan's guard step asks too.

| file | new? | why |
|---|---|---|
| `public/js/ui/ui-functions-click/cell-editor.js` | **new** | what does opening this cell give you |
| `public/js/ui/ui-functions-click/cell-expand.js` | edit | ask that module rather than always setting `contenteditable` |
| `public/css/note-table.css` | edit | any styling an editor needs, beside the mismatch styling already there |

---

## 6. Steps

### Step 1 — Take the date decision

§4. No code. It is first because the answer changes what step 2 builds and whether the writing plan
needs a transformation at all.

### Step 2 — Move the choice out of `cell-expand.js`

`cell-editor.js` answers the question and `cell-expand.js` asks it. Behaviour identical: the plain
cell for everything editable, no caret for the two cases that already refuse one.

**Its own step because it changes nothing.** That is what makes it safe to check — the existing cell
expand tests should pass untouched.

### Step 3 — The list editor

§3. One item per line, read out as an array of strings. Still saves nothing: the writing plan's step
for lists is what closes that loop.

**Checkable without any writing at all:** open a list cell, see one item per line, edit it, collapse
it, and watch the next render discard the change — which is what every cell does today.

### Step 4 — The date control, if §4 chose one

Small, and last because nothing else waits on it.
