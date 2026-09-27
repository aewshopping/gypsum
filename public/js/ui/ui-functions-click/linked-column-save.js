// "add column" and "save" in the linked column dialog.

import { setLinkedProperty, nextLinkedKey } from '../../services/linked-properties.js';
import { addLinkedProperty, saveLinkedProperties } from '../../table-layouts/layout-file.js';
import { takeLinkedColumnRequest } from './linked-column-dialog.js';
import { repaintColumnPicker } from './column-picker.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';

/**
 * Records the column through the one writer and writes it to the layouts file at once — there is no
 * "save layout" to forget, and isDirty is left as it was. A new column is shown straight away as the
 * rightmost, in whichever layout is in use; an edited one only changes what it shows or its name,
 * which no layout records. See plans/table-linked-properties.md §3.1.
 *
 * Nothing here writes a note: a wrong choice makes an odd column, which the dialog puts right.
 *
 * @returns {void}
 */
export function handleLinkedColumnSave() {
    const request = takeLinkedColumnRequest();
    if (!request) return;

    const key = request.key ?? nextLinkedKey();
    setLinkedProperty(key, request.definition);
    if (request.key) saveLinkedProperties();
    else addLinkedProperty(key);

    repaintColumnPicker();
    renderFiles(true, true);
}
