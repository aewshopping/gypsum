import { COPYATTR } from '../../constants.js';

/**
 * Handles the click event for copying text to the clipboard.
 * It prevents the default event action, reads the text to be copied from a data attribute,
 * writes the text to the clipboard, and toggles a 'copied' class on the target element.
 * @param {Event} evt The click event.
 * @param {HTMLElement} target The element that was clicked.
 */
export function handleCopyClick(evt, target) {

    evt.preventDefault(); // stops the details div opening

    const copytext = target.dataset[COPYATTR];

    navigator.clipboard.writeText(copytext);

    target.classList.toggle("copied");

}