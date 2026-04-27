import { appState } from '../../services/store.js';
import { VIEWS } from '../../constants.js';

/**
 * Populates the view-select dropdown with all available views and sets the current value.
 * @returns {void}
 */
export function initViewSelect() {
    const viewSelectElem = document.querySelector('[data-action="view-select"]');

    for (const key in VIEWS) {
        const option = document.createElement('option');
        option.value = VIEWS[key].value;
        option.textContent = VIEWS[key].label;
        viewSelectElem.appendChild(option);
    }

    viewSelectElem.value = appState.viewState;
}
