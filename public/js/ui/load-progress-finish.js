/**
 * Builds the clickable "n yaml errors" nudge appended to the finished-load message.
 * Clicking it runs a `errorOnLoad:yaml` filter through the usual property-filter pathway,
 * narrowing the list to exactly the files whose front matter did not read cleanly.
 * @param {number} errorCount - how many files had YAML lines skipped
 * @returns {string} the HTML for the nudge, or '' when every file read cleanly
 */
function renderLoadErrorNudge(errorCount) {
    if (errorCount === 0) {
        return '';
    }
    const plural = errorCount === 1 ? '' : 's';
    return ` | <span class="load-error-nudge" data-action="property-filter"`
        + ` data-property="errorOnLoad" data-value="yaml"`
        + ` data-tip="show the ${errorCount} file${plural} with unreadable yaml">`
        + `${errorCount} yaml error${plural}</span>`;
}

/**
 * Ends the load progress bar on #fileCountElement: fills the bar, fades it out, and only then
 * swaps in the finished text. The fade length is read back from the same CSS custom properties
 * that drive the fade, so the colour and the text can never drift out of step.
 * @param {HTMLElement} el - the #fileCountElement span
 * @param {number} fileCount - number of files loaded
 * @param {string} durationText - how long the load took, in seconds, e.g. "0.4"
 * @param {string} sourceLabel - where the files came from, e.g. "file system" or "opfs"
 * @param {number} [errorCount=0] - number of files whose YAML front matter did not read cleanly
 * @returns {void}
 */
export function finishLoadProgress(el, fileCount, durationText, sourceLabel, errorCount = 0) {
    const style = getComputedStyle(el);
    const seconds = prop => parseFloat(style.getPropertyValue(prop));
    const fadeMs = (seconds('--load-fade-delay') + seconds('--load-fade-duration')) * 1000;
    const nudge = renderLoadErrorNudge(errorCount);

    // the loop only steps the bar every nth file, so it can stop just short of the 100% marker
    el.style.setProperty('--load-pct', 100);
    el.classList.remove('loading');
    el.classList.add('load-fading');

    setTimeout(() => {
        el.classList.remove('load-fading');
        el.innerHTML = `files: ${fileCount} | ${durationText}s${nudge}`;
        setTimeout(() => {
            el.innerHTML = `<span class="load-finished-msg">files: ${fileCount} | ${sourceLabel}</span>${nudge}`;
        }, 3000);
    }, fadeMs);
}
