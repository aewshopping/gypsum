import { COPYATTR } from '../../constants.js';

/**
 * Handles the click event for copying text to the clipboard.
 * Prevents the default action, reads the text from the target's dataset,
 * writes it to the clipboard, and toggles a 'copied' class for visual feedback.
 * @function handleCopyClick
 * @param {Event} evt - The click event.
 * @param {HTMLElement} target - The element that triggered the copy action.
 * @returns {void}
 */
export function handleCopyClick(evt, target) {

    evt.preventDefault(); // stops the details div opening

    const copytext = target.dataset[COPYATTR];

    navigator.clipboard.writeText(copytext);

    target.classList.toggle("copied");

}