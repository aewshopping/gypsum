/**
 * Builds the phrases appended to the finished-load message when something went wrong.
 *
 * The yaml phrase is clickable: it runs an `errorOnLoad:yaml` filter through the usual
 * property-filter pathway, narrowing the list to those files. The unreadable phrase is not —
 * files that could not be read are absent from myFiles, so there is nothing to filter to.
 *
 * @param {number} yamlErrors - how many loaded files had front-matter problems
 * @param {number} unreadable - how many files could not be read at all, and were skipped
 * @returns {string} the HTML to append, or '' when the load was clean
 */
function renderLoadProblems(yamlErrors, unreadable) {
    let html = '';

    if (yamlErrors > 0) {
        const plural = yamlErrors === 1 ? '' : 's';
        html += ` | <span class="load-error-nudge" data-action="property-filter"`
            + ` data-property="errorOnLoad" data-value="yaml"`
            + ` data-tip="show the ${yamlErrors} file${plural} with unreadable yaml">`
            + `${yamlErrors} yaml error${plural}</span>`;
    }

    if (unreadable > 0) {
        html += ` | <span class="load-error-note"`
            + ` data-tip="skipped: could not be opened">${unreadable} unreadable</span>`;
    }

    return html;
}

/**
 * Ends the load progress bar on #fileCountElement: fills the bar, fades it out, and only then
 * swaps in the finished text. The fade length is read back from the same CSS custom properties
 * that drive the fade, so the colour and the text can never drift out of step.
 * @param {HTMLElement} el - the #fileCountElement span
 * @param {number} fileCount - number of files loaded
 * @param {string} durationText - how long the load took, in seconds, e.g. "0.4"
 * @param {string} sourceLabel - where the files came from, e.g. "file system" or "opfs"
 * @param {{yamlErrors?: number, unreadable?: number}} [problems] - counts of what went wrong
 * @returns {void}
 */
export function finishLoadProgress(el, fileCount, durationText, sourceLabel,
                                   { yamlErrors = 0, unreadable = 0 } = {}) {
    const style = getComputedStyle(el);
    const seconds = prop => parseFloat(style.getPropertyValue(prop));
    const fadeMs = (seconds('--load-fade-delay') + seconds('--load-fade-duration')) * 1000;
    const problems = renderLoadProblems(yamlErrors, unreadable);

    // the loop only steps the bar every nth file, so it can stop just short of the 100% marker
    el.style.setProperty('--load-pct', 100);
    el.classList.remove('loading');
    el.classList.add('load-fading');

    setTimeout(() => {
        el.classList.remove('load-fading');
        el.innerHTML = `files: ${fileCount} | ${durationText}s${problems}`;
        setTimeout(() => {
            el.innerHTML = `<span class="load-finished-msg">files: ${fileCount} | ${sourceLabel}</span>${problems}`;
        }, 3000);
    }, fadeMs);
}
