import { appState } from '../../services/store.js';
import { readRoles, nodeLabel, valueFor } from '../../services/flowchart/node-content.js';
import { toList, linkTarget } from '../../services/internal-links/link-targets.js';
import { linkTargetToFilepath } from '../../services/internal-links/link-target-path.js';
import { checkFileErrors } from '../../services/file-parsing/file-errors.js';
import { linkProperty, planFlowchartLink } from '../../services/flowchart/plan-flowchart-link.js';
import { addFlowchartLink } from '../../editing/add-flowchart-link.js';
import { createEmptyNote, findUnusedFilename } from '../../services/create-note.js';
import { resolveTargetDir } from '../../editing/rename-file.js';
import { validateRenameInputs } from '../../editing/rename-validate.js';
import { extractDirFromFilepath } from '../../services/file-save.js';
import { selectStem } from '../ui-functions-click/file-options-click.js';
import { REFUSALS } from './flowchart-link-add.js';
import { reportFailure } from '../ui-functions-render/output-report.js';
import { markUndoState } from '../ui-functions-render/render-undo-buttons.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { whileWriting } from '../ui-functions-table/bulk-write-busy.js';
import { sortAppStateFiles } from '../../services/file-object-sort.js';
import { propertyType } from '../../services/property-type.js';

/**
 * @file A drag from a note's box released on empty chart: a dialog for the new note's folder and
 * name, and then the note made and the link to it written. See plans/completed/flowchart-view.md step 6.
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
 *
 * **The same dialog creates the note a link already names**, from a press on a missing note's stub.
 * Then the folder and name are the ones the link finds (linkTargetToFilepath, as the editor's own
 * create-from-link uses) and cannot be edited — another name would leave the link still broken — and
 * nothing is written into any note: the link is already there. The line says which notes link to it,
 * since creating it mends every one of those links. It does not open either.
 */

let _source = null;
let _missing = null;  // where the note a link names goes, while the dialog is creating one
let _linkers = [];    // the notes whose links name it
let _from = null;     // where on screen the note comes from: the drop, or the stub pressed

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
 * @param {{x: number, y: number}} at - Where the drag was let go, in client units: the new note's box
 *   glides from there to its place.
 * @returns {Promise<void>}
 */
export async function offerNewLinkedNote(fromId, at) {
    const source = appState.myFiles.find(file => file.internalId === fromId);
    if (!source || appState.bulkWriteInFlight) return;
    if (linkProperty(readRoles()) === null) {
        reportFailure(REFUSALS.unwritable());
        return;
    }

    const folder = extractDirFromFilepath(source.filepath);
    const filename = await findUnusedFilename(await resolveTargetDir(folder));

    _source = source;
    _missing = null;
    _from = at;
    const els = showDialog('New linked note', 'create and link', folder, filename);
    selectStem(els.name);
}

/**
 * Opens the dialog for the note a link names but no note is, at the path the link will find — or
 * nothing, when no note could be made there (the stub then has no action, so this is a backstop).
 *
 * @param {string} target - The link as written, from the stub's `data-target`.
 * @param {?{x: number, y: number}} [at] - The stub's centre on screen, which the new note glides from.
 * @returns {void}
 */
export function offerMissingNote(target, at = null) {
    const path = linkTargetToFilepath(target);
    if (!path || appState.bulkWriteInFlight) return;

    const roles = readRoles();
    const lower = path.filepath.toLowerCase();
    _linkers = appState.myFiles.filter(file => toList(valueFor(file, roles.connectors))
        .some(item => linkTargetToFilepath(linkTarget(item))?.filepath.toLowerCase() === lower));
    _source = null;
    _missing = path;
    _from = at;
    showDialog('Create linked note', 'create note', path.folder, path.filename).confirm.focus();
}

/**
 * A click on a missing note's stub: offers to create it.
 *
 * **On click, not on release** as a box opens. A dialog opened in a `mouseup` is shut at once by the
 * `click` the browser fires next — it lands on the backdrop, and the dialog closes on a click outside
 * it (`closedby="any"`) — so the press did nothing visible at all. Opening in the click itself leaves
 * no event after it. A missing note's stub cannot begin a drag, so it needs none of the press tracking
 * either: a click only fires where the press began and ended on the same element.
 *
 * @param {MouseEvent} event - The click event.
 * @param {SVGGElement} target - The stub, carrying `data-target`.
 * @returns {void}
 */
export function handleMissingNoteClick(event, target) {
    const box = target.getBoundingClientRect();
    offerMissingNote(target.dataset.target, { x: box.left + box.width / 2, y: box.top + box.height / 2 });
}

/**
 * Fills the dialog for one of its two uses and opens it.
 * @param {string} title
 * @param {string} button - What the confirm button says.
 * @param {string} folder
 * @param {string} filename
 * @returns {ReturnType<typeof elements>}
 */
function showDialog(title, button, folder, filename) {
    const els = elements();
    document.getElementById('flowchart-new-note-title').textContent = title;
    els.confirm.textContent = button;
    els.folder.value = folder;
    els.name.value = filename;
    // A note a link names must have the name the link finds.
    els.folder.readOnly = els.name.readOnly = _missing !== null;
    paint();
    els.dialog.showModal();
    return els;
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
    // Where the sort puts it, as the new-note button does: the other views list it by date, and
    // the chart is laid out by key, so the sort does not move it there.
    const { property, direction } = appState.sortState;
    sortAppStateFiles(property, propertyType(property), direction);

    // The chart redrawn after this glides from the one on screen, and the new box from where it came.
    appState.flowchartView.settle = true;
    if (_from) appState.flowchartView.arrival = { fileId: note.internalId, ..._from };

    if (_missing) {
        // Their links resolve now: re-checked, so the broken-link marks go with the stub.
        _linkers.forEach(checkFileErrors);
        renderFiles();
        return;
    }

    const roles = readRoles();
    const plan = planFlowchartLink(source, note, roles);
    // Only 'exists' can be left by now: the source already held a link naming this path, which the
    // new note has just made good. Nothing more to write.
    if (plan.problem) {
        renderFiles();
        return;
    }

    let records = [];
    try {
        records = await whileWriting(false, '', () => addFlowchartLink(source, note, plan.edits));
    } catch {
        // Reported below, as a write that changed nothing.
    }
    markUndoState();
    // Nothing is said when it worked: the new box gliding into place says it.
    if (!records.length) {
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
    if (_missing) {
        forecast.textContent = `Creates ${filepath}, empty, which ${linkersPhrase()} already. The new note does not open.`;
        return;
    }
    const property = linkProperty(readRoles());
    forecast.textContent = `Creates ${filepath}, empty, and adds [[${filepath}]] to ${property} in ${_source.filepath}. The new note does not open.`;
}

/** @returns {string} Who links to the note being created, by the names their boxes show. */
function linkersPhrase() {
    const roles = readRoles();
    const names = _linkers.slice(0, 3).map(file => `“${nodeLabel(file, roles)}”`);
    if (_linkers.length > 3) names.push(`${_linkers.length - 3} more`);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
    return `${list} link${_linkers.length === 1 ? 's' : ''} to`;
}
