import { COPYATTR } from '../../constants.js';

/**
 * Handles the click event for copying text to the clipboard.
 * It prevents the default event action, retrieves the text to be copied
 * from a `data-` attribute on the target element, writes it to the clipboard,
 * and provides visual feedback by toggling a 'copied' class.
 * @param {Event} evt The click event object.
 * @param {HTMLElement} target The element that triggered the action, identified by the event delegate.
 */
export function handleCopyClick(evt, target) {

    evt.preventDefault(); // stops the details div opening

    const copytext = target.dataset[COPYATTR];

    navigator.clipboard.writeText(copytext);

    target.classList.toggle("copied");

}