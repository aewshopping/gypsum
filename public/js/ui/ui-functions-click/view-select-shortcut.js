import { VIEWS } from '../../constants.js';
import { handleViewSelect } from './view-change.js';

/**
 * Switches to the nth view, counting from 1 in the order of VIEWS — which is the order the view
 * select lists them in, and where their numbers come from. Through the select and its own handler,
 * so a view chosen by key is a view chosen in every way the dropdown would have.
 * @param {number} n
 * @returns {boolean} Whether there was an nth view to switch to.
 */
export function selectViewByNumber(n) {
    const view = Object.values(VIEWS)[n - 1];
    if (!view) return false;

    const viewSelectElem = document.querySelector('[data-action="view-select"]');
    if (viewSelectElem.value !== view.value) {
        viewSelectElem.value = view.value;
        handleViewSelect();
    }
    return true;
}
