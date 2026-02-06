import { renderData } from "../ui-functions-render/a-render-all-files.js";
import { appState } from '../../services/store.js';

/**
 * Handles the change event for the view selector dropdown.
 * Updates the view state in the app state and triggers a re-render.
 * @param {Event} evt - The change event.
 * @param {HTMLSelectElement} selectElement - The dropdown element.
 * @returns {void}
 */
export function handleViewSelect(evt, selectElement) {

    const viewSelectElem = document.querySelector('[data-action="view-select"]');
    appState.viewState = viewSelectElem.value;

    renderData();
}