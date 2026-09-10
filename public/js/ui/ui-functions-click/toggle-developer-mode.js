/**
 * DEV-MODE-BYPASS · removal manifest. This feature is developer convenience only; Chrome
 * DevTools does the same job with "Bypass for network" (Application → Service Workers) plus
 * "Disable cache" (Network). To excise it, `grep -rn DEV-MODE-BYPASS` and then:
 *   1. delete this file;
 *   2. index.html — delete the "Developer mode" .info-modal-row, and cut the bootstrap back to
 *      a bare register('./service-worker.js'), KEEPING the gypsum-update-ready listener;
 *   3. event-listeners-add.js — delete the import and the 'toggle-developer-mode' map entry;
 *   4. service-worker.js — delete DEV_MODE and fetchFresh(), both `if (DEV_MODE)` early returns,
 *      and unwrap `if (!DEV_MODE) event.waitUntil(checkForUpdate())`; grepping DEV_MODE in that
 *      file finds every site;
 *   5. bump manifest.json's minor version.
 * Leave alone: the `.toggle` CSS class, shared with the other settings toggles; and
 * tests/pwa.spec.js, which exercises the normal caching path and must still pass. Nothing else
 * touches this — no appState, no other module, no test — and its only stored state is
 * sessionStorage 'gypsum-dev-mode', which the browser drops when the tab closes.
 */

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
