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
 *
 * **And the same again going up.** A row that has scrolled up underneath the sticky header is on
 * screen to the browser too, so a cell focused there, a range's far corner moved there, or a cell
 * opened there stayed hidden — the caret included, until typing made the browser look. The page is
 * scrolled until the cell clears the header's bottom edge, measured rather than worked out from
 * --stick-top-height: the header strip under the search row has no height of its own to read.
 */

/**
 * Where the rows stop being covered: the bottom edge of the table's sticky header, which the rows
 * scroll up underneath. Shared with the range's drag, which scrolls against the same edge.
 * @returns {number} In viewport coordinates.
 */
export function tableChromeBottom() {
    return document.querySelector('.table-chrome')?.getBoundingClientRect().bottom ?? 0;
}

/**
 * Focusin handler — scrolls the table so the focused header cell or body cell is fully visible.
 * Attach to document via event-listeners-add.js.
 * @param {FocusEvent} evt
 * @returns {void}
 */
export function handleTableFocusScroll(evt) {
    const cell = evt.target.closest('.note-table-cell-header, .note-table-cell');
    if (cell) revealCell(cell);
}

/**
 * Scrolls so a header cell or body cell is fully visible: the table sideways, clear of the sticky
 * columns, and — for a body cell — the page up or down, clear of the sticky header and the bottom
 * of the window. Asked by focus, by a range's moving corner, which is shown without being focused,
 * and by a cell opening, which may already have focus and so moves nothing the browser would follow.
 *
 * offsetLeft is in the table's own coordinates for both: a header cell's is measured against
 * .table-chrome and a body cell's against its row, and each of those starts where the scrolled
 * content starts — the same space as the table's scrollLeft. It is also untouched by the
 * scroll-driven transform on .note-table-header, which getBoundingClientRect would have to be
 * corrected for.
 * @param {HTMLElement} cell
 * @returns {void}
 */
export function revealCell(cell) {
    const scroller = document.querySelector('.list-table');
    if (!scroller) return;

    // The header is sticky itself, so only a body cell can be scrolled out of sight up or down.
    // Its top wins when it cannot all fit, since that is where the caret goes.
    if (cell.classList.contains('note-table-cell')) {
        const box = cell.getBoundingClientRect();
        const top = tableChromeBottom();
        if (box.top < top) window.scrollBy(0, box.top - top);
        else if (box.bottom > window.innerHeight) window.scrollBy(0, Math.min(box.bottom - window.innerHeight, box.top - top));
    }

    // A sticky one is always on screen sideways.
    if (cell.classList.contains('is-sticky')) return;

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
