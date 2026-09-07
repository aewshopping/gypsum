/**
 * @file Brings a focused column header into view by scrolling the table.
 *
 * The header sits outside .list-table so it can stick to the page, and its strip is
 * overflow: clip so that nothing can scroll it out of step with the rows (see note-table.css).
 * The cost of that is that the browser has nothing scrollable to reveal a focused header cell
 * in, so tabbing along the columns would walk focus onto cells that are off screen.
 *
 * Scrolling the table is the right answer anyway: the header follows .list-table's scroll
 * position, so moving the table brings the column and its rows into view together — the same
 * thing that already happens when a body cell is tabbed to.
 */

/**
 * Focusin handler — scrolls the table so the focused header cell is fully visible.
 * Attach to document via event-listeners-add.js.
 *
 * offsetLeft is measured against .table-chrome, the nearest positioned ancestor, which is the
 * same coordinate space as the table's scrollLeft. It is also untouched by the scroll-driven
 * transform on .note-table-header, which getBoundingClientRect would have to be corrected for.
 * @param {FocusEvent} evt
 * @returns {void}
 */
export function handleTableHeaderFocus(evt) {
    const cell = evt.target.closest('.note-table-cell-header');
    const scroller = document.querySelector('.list-table');
    if (!cell || !scroller) return;

    const left = cell.offsetLeft;
    const right = left + cell.offsetWidth;

    if (left < scroller.scrollLeft) {
        scroller.scrollLeft = left;
    } else if (right > scroller.scrollLeft + scroller.clientWidth) {
        // min, so a column wider than the scrollport shows its start rather than its end —
        // auto-size can make one 1000px wide.
        scroller.scrollLeft = Math.min(left, right - scroller.clientWidth);
    }
}
