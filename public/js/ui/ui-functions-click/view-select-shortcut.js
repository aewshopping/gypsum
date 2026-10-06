import { VIEWS } from '../../constants.js';
import { switchView } from './view-change.js';

/**
 * Switches to the nth view, counting from 1 in the order of VIEWS — which is the order the side
 * panel lists them in, and where their numbers come from.
 * @param {number} n
 * @returns {boolean} Whether there was an nth view to switch to.
 */
export function selectViewByNumber(n) {
    const view = Object.values(VIEWS)[n - 1];
    if (!view) return false;

    switchView(view.value);
    return true;
}
