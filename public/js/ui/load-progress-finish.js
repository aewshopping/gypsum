/**
 * Ends the load progress bar on #fileCountElement: fills the bar, fades it out, and only then
 * swaps in the finished text. The fade length is read back from the same CSS custom properties
 * that drive the fade, so the colour and the text can never drift out of step.
 * @param {HTMLElement} el - the #fileCountElement span
 * @param {number} fileCount - number of files loaded
 * @param {string} durationText - how long the load took, in seconds, e.g. "0.4"
 * @param {string} sourceLabel - where the files came from, e.g. "file system" or "opfs"
 * @returns {void}
 */
export function finishLoadProgress(el, fileCount, durationText, sourceLabel) {
    const style = getComputedStyle(el);
    const seconds = prop => parseFloat(style.getPropertyValue(prop));
    const fadeMs = (seconds('--load-fade-delay') + seconds('--load-fade-duration')) * 1000;

    // the loop only steps the bar every nth file, so it can stop just short of the 100% marker
    el.style.setProperty('--load-pct', 100);
    el.classList.remove('loading');
    el.classList.add('load-fading');

    setTimeout(() => {
        el.classList.remove('load-fading');
        el.innerHTML = `files: ${fileCount} | ${durationText}s`;
        setTimeout(() => {
            el.innerHTML = `<span class="load-finished-msg">files: ${fileCount} | ${sourceLabel}</span>`;
        }, 3000);
    }, fadeMs);
}
