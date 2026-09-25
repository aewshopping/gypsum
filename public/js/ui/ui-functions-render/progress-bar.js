import { PROGRESS_STEP_SIZE } from '../../constants.js';

/**
 * @file The progress bar behind a line of text — see css/progress-bar.css. The folder load, the
 * backup import and a column delete all drive it through these three calls and nothing else, so the
 * bar moves, fills and fades the same way wherever it is.
 *
 * Only the bar moves while the work runs. The line's text is written once before and once after:
 * changing text above a large table costs a layout per change, which measured as most of a
 * 1,000-note delete's time.
 */

/**
 * Shows the bar, empty.
 * @param {HTMLElement} el - An element with the .progress-bar class.
 * @returns {void}
 */
export function startProgress(el) {
    el.classList.remove('load-fading');
    el.classList.add('loading');
    el.style.setProperty('--load-pct', 0);
}

/**
 * Moves the bar to `done` of `total`, but only every PROGRESS_STEP_SIZE percent and at the end —
 * a hundred updates for a thousand files rather than a thousand.
 * @param {HTMLElement} el
 * @param {number} done - How many are finished.
 * @param {number} total - How many there are.
 * @returns {void}
 */
export function stepProgress(el, done, total) {
    const every = Math.max(1, Math.ceil(total * PROGRESS_STEP_SIZE / 100));
    if (done % every !== 0 && done !== total) return;
    el.style.setProperty('--load-pct', Math.round(Math.min(100, done * 100 / total)));
}

/**
 * Fills the bar and fades it out, resolving once the fade is over — the moment to swap in the
 * finished text. The length is read back from the CSS that drives the fade, so the two cannot
 * drift apart.
 * @param {HTMLElement} el
 * @returns {Promise<void>}
 */
export function endProgress(el) {
    const style = getComputedStyle(el);
    const seconds = prop => parseFloat(style.getPropertyValue(prop)) || 0;
    const fadeMs = (seconds('--load-fade-delay') + seconds('--load-fade-duration')) * 1000;

    // stepped every nth file, the bar can stop just short of the 100% marker
    el.style.setProperty('--load-pct', 100);
    el.classList.remove('loading');
    el.classList.add('load-fading');

    return new Promise(resolve => setTimeout(() => {
        el.classList.remove('load-fading');
        resolve();
    }, fadeMs));
}
