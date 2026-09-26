/**
 * @file Brings a focused header or cell into view by scrolling the table, clear of any sticky
 * columns.
 *
 * Two cases the browser does not cover on its own. The header sits outside .list-table so it can
 * stick to the page, and its strip is overflow: clip so that nothing can scroll it out of step with
 * the rows (see note-table.css) — so the browser has nothing scrollable to reveal a focused header
 * cell in. And a body cell that has scrolled underneath the sticky columns is, as far as the
 * browser is concerned, on screen: nothing is scrolled, and focus lands on a cell nobody can see.
 *
 * Scrolling the table is the right answer to both: the header follows .list-table's scroll
 * position, so moving the table brings the column and its rows into view together.
 */

/**
 * Focusin handler — scrolls the table so the focused header cell or body cell is fully visible.
 * Attach to document via event-listeners-add.js.
 *
 * offsetLeft is in the table's own coordinates for both: a header cell's is measured against
 * .table-chrome and a body cell's against its row, and each of those starts where the scrolled
 * content starts — the same space as the table's scrollLeft. It is also untouched by the
 * scroll-driven transform on .note-table-header, which getBoundingClientRect would have to be
 * corrected for.
 * @param {FocusEvent} evt
 * @returns {void}
 */
export function handleTableFocusScroll(evt) {
    const cell = evt.target.closest('.note-table-cell-header, .note-table-cell');
    const scroller = document.querySelector('.list-table');
    // A sticky one is always on screen.
    if (!cell || !scroller || cell.classList.contains('is-sticky')) return;

    // The sticky columns cover the left of the view, so a cell is only clear of them past their
    // width. Its own row's or header's sticky cells, which are the same widths either way.
    const covered = [...cell.parentElement.querySelectorAll(':scope > .is-sticky')]
        .reduce((sum, sticky) => sum + sticky.offsetWidth, 0);
    const left = cell.offsetLeft - covered;
    const right = cell.offsetLeft + cell.offsetWidth;

    if (left < scroller.scrollLeft) {
        scroller.scrollLeft = left;
    } else if (right > scroller.scrollLeft + scroller.clientWidth) {
        // min, so a column wider than the scrollport shows its start rather than its end —
        // auto-size can make one 1000px wide.
        scroller.scrollLeft = Math.min(left, right - scroller.clientWidth);
    }
}
