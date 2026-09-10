/**
 * Switches PWA caching off (or back on) for this tab, by swapping which service worker is
 * registered: `?dev=1` makes it fetch everything from the network instead of the cache, so
 * local edits show up on a plain refresh with no manifest version bump. The flag also lives
 * in sessionStorage, which index.html reads on load to re-register the matching worker — the
 * browser clears it when the tab closes, so a new session always starts with caching on.
 * @param {Event} evt - The change event from the checkbox input.
 * @param {HTMLInputElement} target - The checkbox element.
 * @returns {Promise<void>}
 */
export async function handleDeveloperModeToggle(evt, target) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((reg) => reg.unregister()));

    // Wiped in both directions: whatever was cached before must not outlive the switch, or it
    // gets served back once caching resumes. Must happen before registering the replacement,
    // so the new worker's install-time addAll does not race the delete.
    await Promise.all((await caches.keys()).map((key) => caches.delete(key)));

    if (target.checked) {
        sessionStorage.setItem('gypsum-dev-mode', 'on');
        await navigator.serviceWorker.register('./service-worker.js?dev=1');
    } else {
        sessionStorage.removeItem('gypsum-dev-mode');
        await navigator.serviceWorker.register('./service-worker.js');
    }
}
