# Plan: a property's type, kept apart from the layout that shows it

Status: **built.**
Manifest version at the start: `1.202.0`. Built at `1.203.0`.
Branch: `claude/type-layout-separation-ya32bh`
Supersedes: `plans/completed/table-value-types.md` §3.1. Restores, differently,
`plans/completed/table-saved-layouts.md` §3.2's "`type` is deliberately not saved".

---

## 1. What this delivers

A column's type stops being part of a saved layout and becomes a fact about the property, stored
once for the folder.

### 1.1 The problem

`plans/completed/table-value-types.md` §3.1 stored the type on the layout's column entry, beside the
width and the visibility. Three things followed, and all three were wrong:

- **Two layouts could disagree.** They were saved at different moments, so switching from "review"
  to "planning" could change what `due` sorted by. A type is not a matter of arrangement — the
  property holds dates or it does not.
- **There was nowhere to put a type under the app's defaults.** With `active: null` there is no
  layout, so the choice was held in memory and lost on reload.
- **Layout files filled with defaults.** The picker read every row back on close, so a layout
  written after that feature recorded a type for every column whether or not anyone had chosen one.
  §7 of that plan noted it made the files wordier; this is why.

### 1.2 What did not change

§1.2 of the earlier plan is untouched and still the founding rule: **changing a type never causes a
file to be written.** Nothing here brings the notes any closer to being rewritten — it only moves
where the choice is recorded.

---

## 2. The file

`layoutVersion` goes to `2` and a `propertyTypes` object joins the top of the document:

```json
{
  "layoutVersion": 2,
  "propertyTypes": {
    "priority": { "type": "number" },
    "people":   { "type": "array", "search_type": "array" }
  },
  "active": "review",
  "layouts": {
    "review": {
      "updated": "2026-09-13T11:02:00.000Z",
      "columns": [
        { "order": 0, "name": "internalId", "label": "file", "width": 90, "visible": true }
      ]
    }
  }
}
```

**Above `layouts`**, because it is read first and a hand-editor should meet it before the long part.

**Only properties someone has typed appear.** An absent key means "ask the schema", so writing every
property out with its resolved type would put the old wall of defaults back in a new place.

**A search type is only kept on a list.** Nothing else in the app searches by whole values, and the
dialog greys the choice off for every other type, so recording one anywhere else writes a setting
that says nothing into a file meant to be read.

**Nothing at all is stored for a property the app fills in itself.** Its type is the app's, and
`setPropertyType()` refuses one however it is asked — a click, or a hand-edited file.

### 2.1 No migration

The app is in development, so a version 1 file is thrown away rather than upgraded. A leftover one
is read as a document with no `propertyTypes`, and the `type` keys it kept on its columns are simply
not read any more — so the folder loses its types instead of breaking. `layoutVersion` is stamped on
write rather than echoed from the file, so anything this app writes says which shape it is in.

Under OPFS there is no file manager to delete the old file with, hence §3.

---

## 3. "delete all layouts"

A button at the bottom of the layouts modal, modelled on the history modal's "clear all history":
same treatment, same place, same confirmation. It removes the whole file — every layout, the active
pointer and every type — and puts the columns back to the app's defaults.

Removing the file rather than writing an empty document over it (which is what `clearAllHistory`
does) is the point: an older file has to leave no residue. Nothing downstream can tell the
difference, because `readLayouts()` already answers with an empty document for a file that is not
there.

**The columns go back to the defaults**, unlike `deleteLayout()`, which leaves the arrangement on
screen alone. That is right for one layout and wrong for all of them: an arrangement left on screen
with `active` reading "default" would be snapped away by the next reset, which re-reads the active
layout.

It is disabled when there is nothing to delete — no saved layout and no chosen type.

---

## 4. Where the type lives now

**`appState.propertyTypes`**, a `Map<string, {type?, search_type?}>`, cleared and refilled on folder
load beside `myFilesProperties`. On `appState` rather than on `TABLE_VIEW_COLUMNS`, because sorting
and search read a type too — it is not a table-view fact.

**`services/property-type.js` gained the one writer**, `setPropertyType(name, type, searchType)`. It
validates, drops what it cannot read rather than correcting it, forgets the entry when nothing
survives, and refuses a property the app fills in. Both ways of setting a type go through it, and so
does the file on load — which is what makes a hand-edited file and a click validate identically. The
duplicate legality sets in `layout-apply.js` went with it.

---

## 5. A locked column is locked

`propertyType()` used to ignore a stored type only for an info column. It now ignores one for
anything `isPropertyEditable()` says no to — every info column, and every `CORE_FILE_PROPERTIES`
member besides: `title`, `tags`, `filename`, `filepath`, `color`, `internalLink`. So does
`propertySearchType()`, which had no guard at all, and so do the column menu's "change type" and the
picker row's type button.

This is a small capability removed on purpose. The header already drew a padlock on those columns —
that is `isPropertyEditable()` too — while still letting you change their type, which was the same
lie from the other side. The app writes those values and their shapes are fixed: `tags` is a Map
whatever a file says about it. Now one question answers whether a cell takes a caret, whether the
header locks, whether the dialog is offered, and whether a stored choice is read.

The picker's tooltip gained a third case for a core column that is not an info column: `text — set
by the app`.

---

## 6. Setting a type reaches the disk at once

`savePropertyTypes()` writes the types and leaves the layouts and the active pointer alone. Its own
write rather than part of saving a layout, because a type is not part of one: there is no "save
types" to forget, and it works with the app's defaults in use.

It does **not** call `refreshState()`. That clears `isDirty`, and a column reorder waiting to be
saved must not start looking saved because a type was set beside it. Setting a type no longer marks
a layout dirty at all.

**It will create the file in a folder that has never saved a layout**, holding `propertyTypes` and an
empty `layouts`. That is a departure from `plans/completed/table-saved-layouts.md` §5's "nothing
creates a layout on its own" — but it creates no *layout*, and setting a type is the user asking,
with nowhere else for the answer to go.

### 6.1 The picker stopped deferring

The two ways of setting a type used to differ: the header menu committed when the type dialog
closed, and the picker held on until the *picker* closed, so that "reset" could undo a type along
with the toggles. With the type written the moment it is set there is nothing left for reset to
undo, so the deferral had become the code telling a lie about what reset covers. Both paths now
commit on the dialog's close, and `readPickerIntoLayout()` is back to visibility and order alone.

`applyActiveLayout()` went through the write queue while this was being done, so the picker's reset
cannot read the file ahead of a write still in flight.

---

## 7. Files

| File | What changed |
|---|---|
| `public/js/services/store.js` | `appState.propertyTypes`; the columnLayout note |
| `public/js/services/property-type.js` | reads the new Map, guards on `isPropertyEditable`, gains `setPropertyType` |
| `public/js/services/directory-handler.js`, `backup/opfs-import.js` | clear it on folder load |
| `public/js/table-layouts/layout-apply.js` | no type on a column entry; `propertyTypesFromState` / `applyPropertyTypesFromFile` |
| `public/js/table-layouts/layout-file.js` | version 2, `savePropertyTypes`, `deleteAllLayouts`, queued `applyActiveLayout` |
| `public/js/ui/ui-functions-click/column-type-set.js` | the picker's commit |
| `public/js/ui/ui-functions-click/column-menu.js` | commits through `setPropertyType`, no dirty mark |
| `public/js/ui/ui-functions-click/column-picker.js` | reads visibility and order only |
| `public/js/ui/ui-functions-click/layouts-modal.js` | `handleLayoutClear`, and the button's disabled state |
| `public/js/ui/ui-functions-table/column-picker-list.js` | refuses the type on every locked column |
| `index.html`, `public/css/table-layouts.css` | the delete-all button |
| `tests/43-table-layouts.spec.js`, `tests/45-column-types.spec.js`, `tests/40-column-menu.spec.js`, `tests/helpers.js` | see below |

---

## 8. What the tests pin

- a type is written at once, without saving a layout, and does not mark one dirty
- a type survives switching between layouts
- a type set under the app's defaults comes back when the folder is reloaded
- a `type` left on a column by an older file is ignored; the `propertyTypes` object is not
- delete all layouts removes the file and returns the table to the defaults; it asks first, and is
  offered only when there is something to delete
- no saved column carries a `type` or a `search_type`
- a file cannot set a type on a column the app fills in — `lastModified`, `title` or `tags`
- the picker and the header menu both refuse the type on a core column, and say who chose instead

`tests/helpers.js`' layouts mock gained `removeEntry`, without which the delete has nothing to
delete.
