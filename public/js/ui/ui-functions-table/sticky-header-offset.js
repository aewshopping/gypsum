/**
 * @file Publishes the height of the app's sticky search row as --stick-top-height.
 *
 * The table's own sticky header (.table-chrome) needs to come to rest below that row
 * rather than underneath it. The row's height varies with the viewport, so it is
 * measured rather than hard-coded. ResizeObserver fires once on observe, so the
 * variable is set as soon as this module loads.
 */

const stickyEl = document.querySelector('.stick-top');

if (stickyEl) {
    new ResizeObserver(([entry]) => {
        const height = Math.round(entry.target.getBoundingClientRect().height);
        document.body.style.setProperty('--stick-top-height', `${height}px`);
    }).observe(stickyEl);
}
