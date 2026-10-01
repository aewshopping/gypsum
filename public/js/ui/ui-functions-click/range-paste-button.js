// The paste button in the table's control row, beside the copy button.

import { pasteFromClipboard } from '../ui-functions-cell/cell-range-paste.js';

/**
 * Pastes the clipboard into the selected cells, through the same path Ctrl+V takes once the text is
 * read. See plans/completed/table-range-paste.md §3.1.
 * @returns {void}
 */
export function handleRangePasteButton() {
    pasteFromClipboard();
}
