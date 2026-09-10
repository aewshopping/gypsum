/**
 * Tells the active service worker whether developer mode is on. While on, the service
 * worker fetches every request straight from the network instead of serving from cache,
 * so local changes show up on a plain refresh without a manifest version bump.
 * @param {Event} evt - The change event from the checkbox input.
 * @param {HTMLInputElement} target - The checkbox element.
 * @returns {void}
 */
export function handleDeveloperModeToggle(evt, target) {
    navigator.serviceWorker.controller?.postMessage({
        type: 'gypsum-set-dev-mode',
        enabled: target.checked,
    });
}
