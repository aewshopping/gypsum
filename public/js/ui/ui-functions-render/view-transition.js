/**
 * @file Whether an animation is wanted, and how to run an update without one.
 *
 * "Animate view changes" in the settings is answered in two places, and they do different jobs.
 * The CSS in view-transitions-off.css zeroes every animation's duration, so nothing moves; this
 * stops the transition being started at all, so nothing is captured either.
 *
 * **They are not the same saving.** A view transition with a zero-length animation still takes a
 * snapshot of the whole page before the update and another after it — measured at a few hundred
 * milliseconds on a fifty-row table — and holds the page still, uninteractive, while it does. Off
 * means off.
 *
 * The CSS stays as the second line of defence: it covers a transition started by a path that
 * forgot to ask, and costs nothing when there is no transition to slow down.
 */

/**
 * Whether view transitions should run: the browser can, and the user has not turned them off.
 *
 * The checkbox is read rather than mirrored into appState, for the same reason the CSS reads it:
 * it is the setting, and a copy is a second thing that can be wrong. Missing means on, which is
 * what the markup says.
 *
 * @returns {boolean}
 */
export function viewTransitionsWanted() {
    return typeof document.startViewTransition === 'function'
        && (document.getElementById('view-transitions-enabled')?.checked ?? true);
}

/**
 * Runs an update inside a view transition, or just runs it when one is not wanted.
 *
 * The stand-in is the small part of the ViewTransition interface this app uses: a `finished`
 * promise, which resolves once the update has run, because that is when everything it was waiting
 * for has happened. Callers then need no branch of their own — the cleanup that belongs after an
 * animation simply happens immediately.
 *
 * @param {Function} update - Changes the DOM. May be async; `finished` waits for it.
 * @returns {{finished: Promise<void>}} The real transition, or a stand-in for one.
 */
export function withViewTransition(update) {
    if (viewTransitionsWanted()) return document.startViewTransition(update);

    return { finished: (async () => { await update(); })() };
}
