# Gypsum — Data Structures Reference

This document describes the in-memory data structures built when files are loaded. It is intended for contributors who want to understand or modify the tag system, search logic, or rendering pipeline.

---

## Per-file object (`appState.myFiles[i]`)

Each entry in `appState.myFiles` is a plain object with these properties:

| Property | Type | Description |
|----------|------|-------------|
| `handle` | `FileSystemFileHandle` | File System API handle (used to re-read content on demand) |
| `filename` | `string` | e.g. `"meeting-notes.md"` |
| `sizeInBytes` | `number` | File size in bytes |
| `title` | `string` | First markdown H1, or first line (max 180 chars) |
| `tags` | `Map<string, {count: number, parents: Set<string>}>` | See below |
| `color` | `string \| null` | Value of the first `#color/<name>` tag, or `null` |
| `lastModified` | `Date` | File modification date |
| `id` | `string` | Unique ID, format `"a0"`, `"a1"`, … |
| `…yamlData` | various | Any YAML front-matter properties are merged in directly |

### `file.tags` — the TagMap

`file.tags` is a `Map` where:
- **Key**: lowercase child tag name (e.g. `"project"`, `"personal"`)
- **Value**: `{ count: 1, parents: Set<string> }`
  - `count`: always `1` (tag is present in this file)
  - `parents`: the set of parent names this child tag is associated with in this file. Empty Set for orphan tags (plain `#tag` or YAML tags with no parent).

This replaces the old parallel arrays `file.tags` (array) and `file.tags_parent` (array).

**Getting a flat array of tag names** (for rendering or sorting):
```js
[...file.tags.keys()]             // ['project', 'personal', ...]
```

**Checking if a file has a specific tag** (O(1)):
```js
file.tags.has('project')          // true / false
```

**Getting the parents of a tag within a file**:
```js
file.tags.get('project')?.parents // Set{'work', 'personal'}
```

---

## Global tag map (`appState.myParentMap`)

`appState.myParentMap` is a `Map<string, Map<string, number>>` built in a single pass after all files are loaded. It replaces the old `myTaxonomy` (array of arrays) and `myTags` (flat array).

**Structure:**

| Key | Value |
|-----|-------|
| `"work"` | `Map { "project" → 3, "tasks" → 1 }` |
| `"personal"` | `Map { "project" → 1, "shopping" → 2 }` |
| `"orphan"` | `Map { "ideas" → 4 }` |
| `"all"` | `Map { "project" → 4, "tasks" → 1, "shopping" → 2, "ideas" → 4 }` |

**Key rules:**
- Named parent keys appear alphabetically
- `"orphan"` contains tags that appear with **no named parent in any file** (pure `#tag` or YAML tags). A tag that appears as `#work/project` in one file and as a plain `#project` in another is **not** an orphan.
- `"all"` contains every child tag with its total count across all files. It is always the last key.
- `"orphan"` is always second-to-last (before `"all"`), and only present if there are orphan tags.

**Getting the flat sorted tag list** (replaces `myTags`):
```js
[...appState.myParentMap.get('all').entries()]  // [['ideas', 4], ['project', 4], ...]
```

**Getting all children of a parent** (for a future "filter by parent" feature):
```js
appState.myParentMap.get('work')   // Map { "project" → 3, "tasks" → 1 }
```

**Orphan detection** works by set subtraction at build time:
```
familyTags = union of all children appearing under any named parent
orphans    = keys('all') − familyTags
```

---

## Worked example

Given three files:

```
meeting-notes.md:  #work/project #personal/project
shopping.txt:      #personal #ideas
big-ideas.md:      #ideas #work/tasks
```

**Per-file TagMaps after loading:**

`meeting-notes.md → file.tags`:
```
Map {
  "project" → { count: 1, parents: Set{"work", "personal"} }
}
```

`shopping.txt → file.tags`:
```
Map {
  "personal" → { count: 1, parents: Set{} }
  "ideas"    → { count: 1, parents: Set{} }
}
```

`big-ideas.md → file.tags`:
```
Map {
  "ideas" → { count: 1, parents: Set{} }
  "tasks" → { count: 1, parents: Set{"work"} }
}
```

**`appState.myParentMap` after the single build pass:**
```
Map {
  "personal" → Map { "project" → 1 }
  "work"     → Map { "project" → 1, "tasks" → 1 }
  "orphan"   → Map { "ideas" → 2, "personal" → 1 }
  "all"      → Map { "ideas" → 2, "personal" → 1, "project" → 1, "tasks" → 1 }
}
```

Note that `"personal"` appears in `"orphan"` because it only ever appears as a plain `#personal` (no named parent). `"project"` does **not** appear in `"orphan"` because it appears under `"work"` and `"personal"` in `meeting-notes.md`.

---

## Pagination state (`appState.paginationState`)

```js
appState.paginationState = {
  currentPage: 1,          // 1-based index of the currently displayed page
  pageFileIds: new Set(),   // IDs of the files visible on the current page
}
```

`pageFileIds` is recomputed on every render inside `a-render-all-files.js`:

1. The full visible list is built — either all files (no active filters) or the subset that passes the active AND/OR filter check via `checkFilesToShow`.
2. The list is sliced to `PAGINATION_SIZE` entries starting at `(currentPage - 1) * PAGINATION_SIZE`.
3. The IDs of that slice are stored as a `Set` in `pageFileIds`.

Each view renderer calls `checkFileOnPage(file.id)` (`pagination/check-file-on-page.js`), which is a single `pageFileIds.has(fileId)` lookup. Because `pageFileIds` was already built from the correctly filtered list, no second filter check is needed.

`currentPage` resets to `1` on every render except when triggered by a page-button click (`handle-page-change.js` passes `keepPage=true`). It is also clamped to the last available page if a filter reduces the total number of pages.

---

## Where the structures are built

| Structure | Built in | Called from |
|-----------|----------|-------------|
| `file.tags` (TagMap) | `file-parsing/file-info.js` → `parseFileContent()` | Once per file, concurrently via `Promise.all()` |
| `appState.myParentMap` | `file-parsing/tag-taxon.js` → `buildParentMap()` | Once after all files load, in `file-handler.js` / `directory-handler.js` |
