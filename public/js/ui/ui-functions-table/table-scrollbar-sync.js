/**
 * @file Keeps the top scrollbar, and where necessary the header, in step with the
 * table's horizontal scroll position.
 *
 * The header is normally driven by CSS (the --table-h-scroll scroll timeline in
 * note-table.css), which runs off the scroll position itself rather than scroll
 * events. The JS fallback here is only used where that is unsupported.
 */

/** True where the header is driven by CSS and needs no scroll listener. */
const cssDrivesHeader = CSS.supports('animation-timeline', 'scroll()');

let _resizeHandler = null;

/**
 * Synchronizes the width of the top scrollbar with the width of the table.
 *
 * @param {object} elements An object containing the scroller and top scrollbar elements.
 */
function syncWidth(elements) {
  // The content inside the top scrollbar must match the scrollable width of the table,
  // so the top scrollbar's thumb (slider) matches the "real" one.
  elements.topScrollContent.style.width = elements.scroller.scrollWidth + 'px';
}

/**
 * Initializes the scrollbar synchronization.
 */
export function initialScrollSync() {

    const topScrollbar = document.getElementById('top-scrollbar-container');
    const scroller = document.querySelector('.list-table'); // the horizontal scroll container
    const header = document.querySelector('.note-table-header');
    const topScrollContent = document.getElementById('top-scrollbar-content');

    const elements = { topScrollbar, scroller, header, topScrollContent };

    // debugging in case any of the elements above can't be found
    for (const key in elements) {
        if (!elements[key]) {
            console.error(`[ScrollSync Error] Element not found: ${key}`);
            return; // Stop execution if an element is missing
        }
    }

    // Initial sync when table first rendered
    syncWidth(elements);
    addScrollEventListeners(elements);
}

/**
 * Adds scroll event listeners to keep the top scrollbar, the table, and (where CSS
 * cannot drive it) the header in sync.
 *
 * @param {object} elements An object containing the scroller, scrollbar and header elements.
 */
function addScrollEventListeners(elements) {

    const { topScrollbar, scroller, header } = elements;

    // A full render replaces these elements, so their own listeners go with them. The
    // window listener outlives them, so the previous one is removed before re-adding.
    if (_resizeHandler) window.removeEventListener('resize', _resizeHandler);
    _resizeHandler = () => syncWidth(elements);
    window.addEventListener('resize', _resizeHandler);

    // --- Synchronize Scroll Events ---

    // When the top scrollbar is scrolled, scroll the table content.
    topScrollbar.addEventListener('scroll', () => {
        scroller.scrollLeft = topScrollbar.scrollLeft;
    });

    // When the table content is scrolled (by user swiping/using default scrollbar),
    // scroll the top bar too — and the header, where CSS is not already doing it.
    scroller.addEventListener('scroll', () => {
        topScrollbar.scrollLeft = scroller.scrollLeft;

        if (!cssDrivesHeader) {
            header.style.transform = `translateX(${-scroller.scrollLeft}px)`;
        }
    });
}
