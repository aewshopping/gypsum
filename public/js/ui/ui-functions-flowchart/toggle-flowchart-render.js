import { appState } from '../../services/store.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';

/**
 * Switches the flowchart view between its mermaid code and its SVG.
 *
 * Held in appState, like the note modal's html / txt switch, so the choice outlives a trip to
 * another view. The render redraws the control row too, so focus is put back on the new switch.
 *
 * @param {Event} event - The change event.
 * @param {HTMLInputElement} target - The switch's checkbox.
 * @returns {void}
 */
export function handleToggleFlowchartRender(event, target) {
    appState.flowchartView.showSvg = target.checked;
    renderFiles(true, true);
    document.querySelector('[data-action="toggle-flowchart-render"]')?.focus();
}
