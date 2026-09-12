/**
 * @file Sizes the top scrollbar's thumb, and drives the thumb and the header where CSS
 * cannot.
 *
 * Both normally ride the --table-h-scroll scroll timeline declared in note-table.css, which
 * runs off the scroll position itself rather than scroll events. That is the whole point of
 * the arrangement: the top scrollbar used to be a second scroll container kept in step by a
 * pair of scroll listeners writing each other's scrollLeft, and on touch the echo landed on
 * .list-table while the finger was still driving it — a programmatic scroll on top of a live
 * one, which takes the gesture off the compositor and drops frames. Nothing here listens to
 * scroll unless the browser has no scroll timelines.
 */

/** True where the header and thumb are driven by CSS and need no scroll listener. */
const cssDrivesHeader = CSS.supports('animation-timeline', 'scroll()');

/**
 * Keeps the thumb the right length as the scroller's width changes. A window resize is not
 * enough on its own: the view transition that brings the table in animates its width, the
 * recent files panel pushes it narrower by setting body's padding, and neither fires one.
 * Sizing the thumb from a width measured mid-transition made it permanently too short.
 */
const _widthObserver = new ResizeObserver(() => syncScrollbarThumb());

/**
 * Sizes the thumb to the share of the table that is on screen, the proportion a scrollbar
 * thumb has always stood for.
 *
 * The ratio goes on .table-wrapper rather than on body, where --grid-columns lives: it
 * describes one table and should go when that table does. CSS turns it into a width against
 * the track, so nothing here measures or positions the thumb itself.
 *
 * Re-queries its elements rather than closing over them, so callers that outlive a render —
 * the width observer, and the column resize drop — do not hold on to replaced nodes.
 * @returns {void}
 */
export function syncScrollbarThumb() {
  const scroller = document.querySelector('.list-table');
  const wrapper = document.querySelector('.table-wrapper');
  const track = document.getElementById('top-scrollbar-container');
  if (!scroller || !wrapper || !track) return; // not in table view

  const ratio = scroller.clientWidth / scroller.scrollWidth;
  wrapper.style.setProperty('--table-scroll-ratio', ratio);

  // A table that fits has nothing to scroll, and a full-width thumb that cannot move says
  // so less clearly than no scrollbar at all.
  track.toggleAttribute('data-scrollable', ratio < 1);
}

/**
 * Initializes the scrollbar: sizes the thumb, and starts watching for the things that
 * change its length.
 */
export function initialScrollSync() {

    const topScrollbar = document.getElementById('top-scrollbar-container');
    const scroller = document.querySelector('.list-table'); // the horizontal scroll container
    const header = document.querySelector('.note-table-header');
    const thumb = document.getElementById('top-scrollbar-thumb');

    const elements = { topScrollbar, scroller, header, thumb };

    // debugging in case any of the elements above can't be found
    for (const key in elements) {
        if (!elements[key]) {
            console.error(`[ScrollSync Error] Element not found: ${key}`);
            return; // Stop execution if an element is missing
        }
    }

    // Initial sync when table first rendered
    syncScrollbarThumb();

    // A full render replaces the scroller, so the old element is dropped before the new one
    // is watched.
    _widthObserver.disconnect();
    _widthObserver.observe(scroller);

    addScrollEventListeners(elements);
}

/**
 * Where scroll timelines are missing, moves the header and the thumb from a scroll event.
 *
 * @param {object} elements An object containing the scroller, thumb and header elements.
 */
function addScrollEventListeners(elements) {

    const { topScrollbar, scroller, header, thumb } = elements;

    // Deliberately no scroll listener on the supported path: reading and writing layout on
    // every scrolled frame is what made horizontal scrolling stutter on touch. The fallback
    // below accepts that cost only where there is no other way to move the two elements.
    if (cssDrivesHeader) return;

    // A full render replaces the scroller, so this listener goes with it.
    scroller.addEventListener('scroll', () => {
        const progress = scroller.scrollLeft / (scroller.scrollWidth - scroller.clientWidth);
        header.style.transform = `translateX(${-scroller.scrollLeft}px)`;
        thumb.style.transform =
            `translateX(${progress * (topScrollbar.clientWidth - thumb.offsetWidth)}px)`;
    });
}
