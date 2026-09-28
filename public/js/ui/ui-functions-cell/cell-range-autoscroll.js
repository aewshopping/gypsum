/**
 * @file Scrolling the table while a range is dragged against its edge, and finding the cell under a
 * pointer that may be off the table altogether.
 *
 * **The browser does neither for a range.** Its own edge scrolling belongs to text selection, which
 * the range turns off (note-table-range.css), and content scrolling under a still pointer fires no
 * pointermove — so without this a range stopped growing at the edge of the screen, and did not
 * follow even a wheel scroll until the mouse moved again.
 *
 * **Spreadsheet behaviour.** While a drag is on, a pointer inside a strip along any edge of the
 * visible rows, or past that edge, scrolls every frame, faster the deeper it is. The left strip
 * starts where the sticky columns end, because pointing at a sticky cell has to mean that cell.
 *
 * **One owner for "the pointer is over a different cell now"**: a scroll listener, alive only for
 * the drag. It fires for this loop's scrolling and for the wheel alike, so neither runs the hit test
 * itself. Nothing here is registered in event-listeners-add.js — it all lives and dies with a drag,
 * started and stopped by cell-range-drag.js. See plans/table-range-select-copy.md §6.
 */

const STRIP = 40;       // px inside an edge where scrolling starts
const MIN_SPEED = 2;    // px a frame at the strip's inner edge
const MAX_SPEED = 30;   // px a frame, reached a strip's width past the edge

let scroller = null;    // .list-table, for as long as a drag is on
let pointer = null;     // the pointer's last {x, y}, in the viewport
let frame = 0;
let onScroll = null;

/**
 * The visible part of the rows, in viewport coordinates: below the sticky header, above the bottom
 * of the window, and no further than the rows go — .list-table carries padding below its last row.
 * @returns {{top: number, bottom: number, left: number, right: number, stickyRight: number}}
 */
function visibleRows() {
    const box = scroller.getBoundingClientRect();
    const chrome = document.querySelector('.table-chrome')?.getBoundingClientRect().bottom ?? 0;
    const rows = scroller.lastElementChild?.getBoundingClientRect();
    const sticky = parseFloat(getComputedStyle(document.body).getPropertyValue('--sticky-width')) || 0;
    return {
        top: Math.max(chrome, scroller.firstElementChild?.getBoundingClientRect().top ?? box.top),
        bottom: Math.min(window.innerHeight, rows?.bottom ?? box.bottom),
        left: box.left,
        right: box.left + scroller.clientWidth,
        stickyRight: box.left + sticky,
    };
}

/**
 * How fast to scroll for a pointer this far into a strip, or past its edge.
 * @param {number} depth - Px from the strip's inner edge; nothing to do at 0 or less.
 * @returns {number}
 */
function speedAt(depth) {
    if (depth <= 0) return 0;
    return Math.min(MAX_SPEED, MIN_SPEED + (MAX_SPEED - MIN_SPEED) * depth / (2 * STRIP));
}

/**
 * The scroll each axis wants this frame, and nothing where the table can go no further that way.
 * @returns {{dx: number, dy: number}}
 */
function velocity() {
    const { x, y } = pointer;
    const v = visibleRows();
    const lastRow = scroller.lastElementChild?.getBoundingClientRect().bottom ?? 0;
    const firstRow = scroller.firstElementChild?.getBoundingClientRect().top ?? 0;
    const maxLeft = scroller.scrollWidth - scroller.clientWidth;

    let dy = 0;
    if (y > window.innerHeight - STRIP && lastRow > window.innerHeight) dy = speedAt(y - (window.innerHeight - STRIP));
    if (y < v.top + STRIP && firstRow < v.top) dy = -speedAt(v.top + STRIP - y);

    // Over the sticky columns is pointing at them, not asking to scroll — unless the pointer has
    // left the table altogether.
    let dx = 0;
    const leftStrip = x < v.stickyRight + STRIP && (x >= v.stickyRight || x < v.left);
    if (x > v.right - STRIP && scroller.scrollLeft < maxLeft) dx = speedAt(x - (v.right - STRIP));
    if (leftStrip && scroller.scrollLeft > 0) dx = -speedAt(v.stickyRight + STRIP - x);

    return { dx, dy };
}

/**
 * One frame: scroll, and come back next frame while there is still somewhere to go. The scroll
 * listener finds the cell that has moved under the pointer.
 * @returns {void}
 */
function tick() {
    frame = 0;
    const { dx, dy } = velocity();
    if (!dx && !dy) return;

    if (dx) scroller.scrollLeft += dx;
    if (dy) window.scrollBy(0, dy);
    frame = requestAnimationFrame(tick);
}

/**
 * The table cell under the pointer's last position — clamped into the visible rows first, so a
 * pointer below the window or past the table's right edge means the edge row or column rather than
 * nothing. Looks through anything drawn over the table, such as the new note button.
 * @returns {HTMLElement|null}
 */
export function cellUnderPointer() {
    if (!scroller || !pointer) return null;
    const v = visibleRows();
    const x = Math.min(Math.max(pointer.x, v.left + 1), v.right - 1);
    const y = Math.min(Math.max(pointer.y, v.top + 1), v.bottom - 1);

    return document.elementsFromPoint(x, y)
        .map(el => el.closest('.list-table .note-table-cell'))
        .find(Boolean) ?? null;
}

/**
 * Records where the pointer is, and scrolls if that is against an edge. Called on every move of a
 * drag, including the moves before autoscroll has started, so the hit test always has a position.
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
export function followPointer(x, y) {
    pointer = { x, y };
    scroller ??= document.querySelector('.list-table');
    if (onScroll && !frame) frame = requestAnimationFrame(tick);
}

/**
 * The drag has become a range: from now on, an edge scrolls and any scroll re-asks which cell is
 * under the pointer.
 * @param {function(): void} whenScrolled - What to do after the table or the page has scrolled.
 * @returns {void}
 */
export function startAutoscroll(whenScrolled) {
    onScroll = whenScrolled;
    window.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('scroll', onScroll, { passive: true });
    frame = requestAnimationFrame(tick);
}

/**
 * The drag is over: stop scrolling, and let go of everything the drag held.
 * @returns {void}
 */
export function stopAutoscroll() {
    cancelAnimationFrame(frame);
    if (onScroll) {
        window.removeEventListener('scroll', onScroll);
        scroller?.removeEventListener('scroll', onScroll);
    }
    frame = 0;
    onScroll = null;
    scroller = null;
    pointer = null;
}
