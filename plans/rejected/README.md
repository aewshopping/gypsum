# Rejected plans

Features that were considered and deliberately **not** built.

Each file here records what the feature would have been and why it was turned down, so that
anyone wondering why something obvious is missing — a real text editor, a proper undo stack,
remembered folders — can find the answer rather than assume it was an oversight.

These are decisions, not a backlog. A plan moving out of this folder means the reasoning
below changed, and the file should say so.

| Plan | Rejected because |
|------|------------------|
| `codemirror-6-editor.md` | 0.5mb for benefits this app does not need |
| `granular-history-diff.md` | The rough "what disappeared" diff is already the useful part |
| `undo-library.md` | Complexity and cursor bugs; the browser's own undo is adequate |
| `save-folder-handle-indexeddb.md` | Permission prompt every load anyway, so nothing is saved |
| `settings-file.md` | Settings are a styling scratchpad, and mobile sizing should not follow you to desktop |
