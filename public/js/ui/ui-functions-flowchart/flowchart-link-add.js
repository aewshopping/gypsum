import { appState } from '../../services/store.js';
import { readRoles, nodeLabel } from '../../services/flowchart/node-content.js';
import { planFlowchartLink } from '../../services/flowchart/plan-flowchart-link.js';
import { addFlowchartLink } from '../../editing/add-flowchart-link.js';
import { showWarningModal } from '../ui-functions-click/warning-modal.js';
import { reportAction, reportFailure } from '../ui-functions-render/output-report.js';

/** What the report line says when a plan refuses, by its reason. */
const REFUSALS = {
    exists: (from, to) => `${from} already links to ${to}`,
    unwritable: () => 'the connectors option names a property the chart cannot write to',
    self: () => 'a note cannot be linked to itself by dragging',
};

/**
 * Offers the link a drag drew, and writes it if the person says so.
 *
 * The dialog shows exactly what will be written, property by property, because a drag writes into a
 * note without the note being open — nothing reaches the file until "add link" is pressed. A plan
 * that refuses says why in the report line instead, and writes nothing.
 *
 * @param {string} fromId - internalId of the note the drag began on.
 * @param {string} toId - internalId of the note it was released over.
 * @returns {Promise<void>}
 */
export async function linkNotes(fromId, toId) {
    const source = appState.myFiles.find(file => file.internalId === fromId);
    const target = appState.myFiles.find(file => file.internalId === toId);
    if (!source || !target) return;

    const roles = readRoles();
    const from = nodeLabel(source, roles), to = nodeLabel(target, roles);
    const plan = planFlowchartLink(source, target, roles);
    if (plan.problem) {
        reportFailure(REFUSALS[plan.problem](from, to));
        return;
    }

    const lines = plan.edits.map(edit => `${edit.property}: ${edit.items.at(-1)}`).join('\n');
    const ok = await showWarningModal(
        `Add a link from “${from}” to “${to}”?\n\nThis adds to ${source.filepath}:\n${lines}`,
        'add link', 'cancel');
    if (!ok) return;

    try {
        const records = await addFlowchartLink(source, target, plan.edits);
        if (records.length) reportAction(`linked ${from} → ${to}`);
        else reportFailure(`${source.filepath} could not be written`);
    } catch (error) {
        reportFailure(`${source.filepath} could not be written: ${error.message}`);
    }
}
