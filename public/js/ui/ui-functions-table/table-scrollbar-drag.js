/**
 * @file Drag-to-scroll for the top scrollbar's thumb.
 *
 * The thumb is a drawn element rather than a real scrollbar, so the one thing a real one did
 * for free has to be written out: dragging it scrolls the table. Everything else about the
 * thumb — its length, and where it sits at a given scroll position — is CSS.
 *
 * Pointer events, not mouse events, for the reason set out in table-col-resize.js: a finger
 * drag fires no mousemove, so a mouse-event drag loop gets a press and a release with nothing
 * in between.
 */

let _startX = 0;        // drag origin, in track pixels
let _startScroll = 0;   // where the table was when the drag began
let _perTrackPx = 0;    // content pixels covered by one pixel of thumb travel
let _dragging = false;  // the move and end handlers see every pointer event on the page and
                        // use this to know which are theirs

/**
 * @returns {HTMLElement|null} The table's horizontal scroll container, if it is rendered.
 */
function scrollerElement() {
    return document.querySelector('.list-table');
}

/**
 * How far the table moves for each pixel the thumb is dragged.
 *
 * Taken from what is actually on screen rather than from the ratio the thumb was sized with.
 * The two agree only while that ratio is current, and the thumb's length is also floored by
 * its min-width on a very wide table. Measuring the travel the thumb really has is the one
 * reading that always matches where the animation will put it.
 *
 * @param {HTMLElement} scroller
 * @param {HTMLElement} thumb
 * @returns {number}
 */
function contentPerTrackPx(scroller, thumb) {
    const track = document.getElementById('top-scrollbar-container');
    return (scroller.scrollWidth - scroller.clientWidth)
           / (track.clientWidth - thumb.offsetWidth);
}

/**
 * Starts a drag, reached from the thumb's data-action. Pointer capture keeps the gesture
 * alive when the pointer leaves the thumb or the window; captured events still reach the
 * document handlers below, which is what carries the rest of it.
 * @param {PointerEvent} evt
 * @param {HTMLElement} thumb - The thumb carrying the data-action.
 * @returns {void}
 */
export function handleScrollbarDragStart(evt, thumb) {
    const scroller = scrollerElement();
    if (!scroller || !evt.isPrimary) return;

    evt.preventDefault(); // no text selection, no native drag
    thumb.setPointerCapture(evt.pointerId);

    _startX = evt.clientX;
    _startScroll = scroller.scrollLeft;
    _perTrackPx = contentPerTrackPx(scroller, thumb);
    _dragging = true;
}

/**
 * Scrolls the table by however far the thumb has been dragged. The thumb moves in track
 * pixels and the table in content pixels, which is what the conversion above stands for.
 *
 * The thumb's own position is left alone: its animation places it from the table's real
 * scroll offset, so it follows this write. Setting it here as well would put the main thread
 * back in the per-frame path, which is the cost this whole arrangement exists to avoid.
 *
 * Every pointer move on the page reaches this, so it leaves immediately unless a drag is
 * actually in flight.
 * @param {PointerEvent} evt
 * @returns {void}
 */
export function handleScrollbarDragMove(evt) {
    if (!_dragging) return;

    const scroller = scrollerElement();
    if (!scroller) return;

    scroller.scrollLeft = _startScroll + (evt.clientX - _startX) * _perTrackPx;
}

/**
 * Ends the drag. Reached by every pointerup and pointercancel on the page, so like the move
 * handler it leaves unless there is a drag to end.
 * @returns {void}
 */
export function handleScrollbarDragEnd() {
    _dragging = false;
}
