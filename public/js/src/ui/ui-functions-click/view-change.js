import { renderData } from "../ui-functions-render/render-all-files.js";
import { appState } from '../../services/store.js';

export function handleViewSelect(evt, selectElement) {

    const viewSelectElem = document.querySelector('[data-action="view-select"]');
    appState.viewState = viewSelectElem.value;

    renderData();
}