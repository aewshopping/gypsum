import { renderData } from "../ui-functions-render/render-all-files.js";
import { appState } from '../../services/store.js';

/**
 * Handles the change event from the view selector dropdown.
 * It updates the `appState.viewState` with the new selected value
 * and then triggers a re-render of the file list.
 * @param {Event} evt The change event object.
 * @param {HTMLSelectElement} selectElement The select element that triggered the event.
 */
export function handleViewSelect(evt, selectElement) {

    const viewSelectElem = document.querySelector('[data-action="view-select"]');
    appState.viewState = viewSelectElem.value;

    renderData();
}