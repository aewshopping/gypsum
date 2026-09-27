/**
 * @file A press on the top scrollbar's track, beside the thumb rather than on it.
 *
 * A real scrollbar pages towards the press; this one is drawn, so that has to be written out,
 * the same way dragging the thumb is in table-scrollbar-drag.js.
 */

/** Share of the visible width one press moves, as Chrome's own scrollbars do. */
const PAGE_SHARE = 0.875;

/**
 * Scrolls the table a page towards the side of the thumb that was pressed. A press on the thumb
 * finds the thumb's own data-action first, so only the bare track reaches this.
 * @param {PointerEvent} evt
 * @param {HTMLElement} track - The track carrying the data-action.
 * @returns {void}
 */
export function handleScrollbarTrackPress(evt, track) {
    const scroller = document.querySelector('.list-table');
    const thumb = document.getElementById('top-scrollbar-thumb');
    if (!scroller || !thumb || !evt.isPrimary) return;

    evt.preventDefault(); // no text selection
    const direction = evt.clientX < thumb.getBoundingClientRect().left ? -1 : 1;
    scroller.scrollBy({ left: direction * scroller.clientWidth * PAGE_SHARE, behavior: 'smooth' });
}
