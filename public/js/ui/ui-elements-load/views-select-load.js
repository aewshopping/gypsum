import { appState } from '../../services/store.js';
import { VIEWS } from '../../constants.js';

/**
 * Populates the view-select dropdown with all available views, numbered, and sets the current
 * value. The settings modal's Alt+number line is given the last number.
 * @returns {void}
 */
export function initViewSelect() {
    const viewSelectElem = document.querySelector('[data-action="view-select"]');

    // Numbered here rather than in VIEWS, so a view's number is its place in the list and cannot
    // drift from the Alt+number that picks it (view-select-shortcut.js).
    Object.values(VIEWS).forEach((view, i) => {
        const option = document.createElement('option');
        option.value = view.value;
        option.textContent = `${i + 1}. ${view.label}`;
        viewSelectElem.appendChild(option);
    });
    document.getElementById('shortcut-last-view').textContent = Object.keys(VIEWS).length;

    viewSelectElem.value = appState.viewState;
}
