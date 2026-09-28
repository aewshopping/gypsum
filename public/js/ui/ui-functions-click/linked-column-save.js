// "add column" and "save" in the linked column dialog.

import { setLinkedProperty, nextLinkedKey, linkedProperty } from '../../services/linked-properties.js';
import { addLinkedProperty, saveLinkedProperties } from '../../table-layouts/layout-file.js';
import { takeLinkedColumnRequest } from './linked-column-dialog.js';
import { repaintColumnPicker } from './column-picker.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';

/**
 * Records the column through the one writer and writes it to the layouts file at once — there is no
 * "save layout" to forget, and isDirty is left as it was. A new column is shown straight away as the
 * rightmost, in whichever layout is in use; an edited one only changes what it shows or its name,
 * which no layout records. See plans/completed/table-linked-properties.md §3.1.
 *
 * Nothing here writes a note: a wrong choice makes an odd column, which the dialog puts right.
 *
 * @returns {void}
 */
export function handleLinkedColumnSave() {
    const request = takeLinkedColumnRequest();
    if (!request) return;

    // The dialog knows nothing of where the column was last copied to, and a re-point or a rename
    // is no reason to forget it. plans/completed/table-copy-column.md §5.5.
    const key = request.key ?? nextLinkedKey();
    const copyTo = request.key ? linkedProperty(request.key)?.copyTo : undefined;
    setLinkedProperty(key, { ...request.definition, copyTo });
    if (request.key) saveLinkedProperties();
    else addLinkedProperty(key);

    repaintColumnPicker();
    renderFiles(true, true);
}
