import { renderFiles } from "../ui-functions-render/a-render-all-files.js";
import { appState } from '../../services/store.js';
import { rememberChartView } from '../ui-functions-flowchart/flowchart-view-memory.js';
import { markCurrentView } from '../ui-elements-load/view-buttons-load.js';

/**
 * A press on one of the side panel's view buttons.
 * @param {Event} evt - The click event.
 * @param {HTMLElement} button - The button, carrying the view's value in `data-view`.
 * @returns {void}
 */
export function handleViewSelect(evt, button) {
    switchView(button.dataset.view);
}

/**
 * Shows the named view. The one way a view changes, whether by button or by Alt+number. Choosing
 * the view already on screen does nothing.
 * @param {string} view - A value from VIEWS.
 * @returns {void}
 */
export function switchView(view) {
    if (view === appState.viewState) return;

    // Leaving the flowchart keeps its pan and zoom for coming back to the same layout.
    rememberChartView();

    appState.viewState = view;
    markCurrentView();

    // A new visit to whichever view this is: Ctrl+Z reaches only what is done from here on, and
    // the undo list keeps the rest. plans/completed/table-delete-column.md §10.4.
    appState.undoHorizon = Date.now();

    renderFiles();
}
