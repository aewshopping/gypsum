import { PAGINATION_SIZE, setPaginationSize } from '../../constants.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';

const DEFAULT_PAGINATION_SIZE = PAGINATION_SIZE;

/**
 * Handles the change event on the pagination size input.
 * Reverts to the default if the value is out of range or not a whole number.
 * @param {Event} event - The change event from the input.
 * @returns {void}
 */
export function handlePaginationSizeChange(event) {
    const val = parseInt(event.target.value, 10);
    if (Number.isInteger(val) && val >= 10 && val <= 1000) {
        setPaginationSize(val);
    } else {
        event.target.value = PAGINATION_SIZE;
    }
    renderFiles();
}

/**
 * Resets the pagination size to the value defined in constants.js.
 * @returns {void}
 */
export function handleResetPaginationSize() {
    setPaginationSize(DEFAULT_PAGINATION_SIZE);
    document.getElementById('pagination-size-input').value = DEFAULT_PAGINATION_SIZE;
    renderFiles();
}
