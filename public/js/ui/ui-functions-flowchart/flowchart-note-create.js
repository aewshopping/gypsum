import { appState } from '../../services/store.js';
import { readRoles, nodeLabel } from '../../services/flowchart/node-content.js';
import { linkProperty, planFlowchartLink } from '../../services/flowchart/plan-flowchart-link.js';
import { addFlowchartLink } from '../../editing/add-flowchart-link.js';
import { createEmptyNote, findUnusedFilename } from '../../services/create-note.js';
import { resolveTargetDir } from '../../editing/rename-file.js';
import { validateRenameInputs } from '../../editing/rename-validate.js';
import { extractDirFromFilepath } from '../../services/file-save.js';
import { selectStem } from '../ui-functions-click/file-options-click.js';
import { REFUSALS } from './flowchart-link-add.js';
import { reportAction, reportFailure } from '../ui-functions-render/output-report.js';
import { markUndoState } from '../ui-functions-render/render-undo-buttons.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';

/**
 * @file A drag from a note's box released on empty chart: a dialog for the new note's folder and
 * name, and then the note made and the link to it written. See plans/flowchart-view.md step 6.
 *
 * **The dialog is the confirmation**, as the rename dialog is: the line under the boxes says what
 * will be created and what is written into the note the drag began on, or why the name cannot be
 * used, and the button is pressable only when it can be done. It opens on the next free `note-N.txt`
 * in the source note's folder, the new-note button's convention, with the stem selected so typing
 * replaces it and keeps the extension. A name a loaded note has is refused rather than linked to —
 * dragging onto that note's box is how to link to it.
 *
 * **The note first, then the link**, through the same plan and writer as a drag between two boxes, so
 * the link is one undo entry like any other. The note does not open, and no text is written into it:
 * its box shows its filename, the node text's fallback. Filtered out, it is still on the chart — its
 * source links to it, so it is drawn as a stub, which opens it.
 */

let _source = null;

const elements = () => ({
    dialog: document.getElementById('modal-flowchart-new-note'),
    folder: document.getElementById('flowchart-new-note-folder'),
    name: document.getElementById('flowchart-new-note-name'),
    forecast: document.getElementById('flowchart-new-note-forecast'),
    problem: document.getElementById('flowchart-new-note-problem'),
    confirm: document.getElementById('flowchart-new-note-confirm'),
});

/**
 * Opens the dialog for a note linked from `fromId` — unless the connectors option names a property
 * the chart cannot write, when it says so instead: a note made for a link that could not be written
 * would only be clutter.
 *
 * @param {string} fromId - internalId of the note the drag began on.
 * @returns {Promise<void>}
 */
export async function offerNewLinkedNote(fromId) {
    const source = appState.myFiles.find(file => file.internalId === fromId);
    if (!source || appState.bulkWriteInFlight) return;
    if (linkProperty(readRoles()) === null) {
        reportFailure(REFUSALS.unwritable());
        return;
    }

    const folder = extractDirFromFilepath(source.filepath);
    const filename = await findUnusedFilename(await resolveTargetDir(folder));

    _source = source;
    const els = elements();
    els.folder.value = folder;
    els.name.value = filename;
    paint();
    els.dialog.showModal();
    selectStem(els.name);
}

/**
 * Every keystroke in either box: the line under them, and whether the button can be pressed.
 * @returns {void}
 */
export function handleFlowchartNewNoteInput() {
    paint();
}

/**
 * Enter in either box presses the button when it can be pressed; the line already says why not.
 * @param {KeyboardEvent} evt
 * @returns {void}
 */
export function handleFlowchartNewNoteKeydown(evt) {
    if (evt.key !== 'Enter' || !evt.target.closest?.('#modal-flowchart-new-note input')) return;
    evt.preventDefault();
    const { confirm } = elements();
    if (!confirm.disabled) confirm.click();
}

/**
 * Cancel and the close button.
 * @returns {void}
 */
export function handleFlowchartNewNoteCancel() {
    elements().dialog.close();
}

/**
 * "create and link": makes the note, then writes the link to it. Checked again rather than trusted
 * from the button.
 * @returns {Promise<void>}
 */
export async function handleFlowchartNewNoteConfirm() {
    const check = validate();
    if (!check.ok) return;
    elements().dialog.close('create');

    const source = _source;
    const { normalizedFolder: folder, normalizedName: filename } = check;
    const filepath = folder ? `${folder}/${filename}` : filename;

    let note;
    try {
        note = await createEmptyNote(folder, filename);
    } catch (error) {
        reportFailure(`${filepath} could not be created: ${error.message}`);
        return;
    }

    const roles = readRoles();
    const from = nodeLabel(source, roles);
    const plan = planFlowchartLink(source, note, roles);
    // Only 'exists' can be left by now: the source already held a link naming this path, which the
    // new note has just made good. Nothing more to write.
    if (plan.problem) {
        renderFiles();
        reportAction(`created ${filepath}, which ${from} already links to`);
        return;
    }

    let records = [];
    try {
        records = await addFlowchartLink(source, note, plan.edits);
    } catch {
        // Reported below, as a write that changed nothing.
    }
    markUndoState();
    if (records.length) {
        reportAction(`created ${filepath}, linked from ${from}`);
    } else {
        renderFiles();
        reportFailure(`created ${filepath}, but ${source.filepath} could not be written`);
    }
}

/**
 * Whether what is typed names a note that can be made: rename-validate.js's rules for a filename and
 * a folder, against a file that does not exist yet.
 * @returns {{ok: true, normalizedFolder: string, normalizedName: string} | {ok: false, reason: string}}
 */
function validate() {
    const { folder, name } = elements();
    const result = validateRenameInputs({
        currentFile: { filename: '', filepath: '' }, // no file is being renamed, so nothing to match
        newFolder: folder.value, newName: name.value, myFiles: appState.myFiles,
    });
    if (result.ok || !result.reason.startsWith('A loaded file')) return result;
    return { ok: false, reason: 'A note with that name already exists. Drag onto its box to link to it.' };
}

/**
 * Shows the refusal or the forecast under the boxes, and enables the button, from what is typed now.
 * @returns {void}
 */
function paint() {
    const { forecast, problem, confirm } = elements();
    const check = validate();

    // The two lines take turns in one place, and both stay laid out, so the dialog keeps its size.
    problem.textContent = check.ok ? '' : check.reason;
    problem.hidden = check.ok;
    forecast.hidden = !check.ok;
    confirm.disabled = !check.ok;
    if (!check.ok) return;

    const filepath = check.normalizedFolder ? `${check.normalizedFolder}/${check.normalizedName}` : check.normalizedName;
    const property = linkProperty(readRoles());
    forecast.textContent = `Creates ${filepath}, empty, and adds [[${filepath}]] to ${property} in ${_source.filepath}. The new note does not open.`;
}
