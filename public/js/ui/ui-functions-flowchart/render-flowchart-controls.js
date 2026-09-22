/**
 * Renders the flowchart's control row: one button, onto the options dialog.
 *
 * A sibling of ui-functions-table/render-table-controls.js, and it shares that row's shape through
 * `.output-controls` — the class both views' rows carry, which is what stops the two drifting apart
 * visually. There is nothing on top of it: this view's row wants nothing the other does not.
 *
 * It is drawn by the view rather than shown and hidden by the page, for the reason the table's row
 * is: a control row that only exists while its view is rendered needs no view-conditional logic
 * anywhere, and no dialog reachable from it needs any either.
 *
 * The glyph's outer viewBox starts at 0 0 rather than repeating the symbol's own box: a <use> is
 * placed at the origin of the box it sits in, so only the aspect ratio has to match.
 *
 * @returns {string} HTML string for the control row.
 */
export function renderFlowchartControls() {
    return `
            <div class="output-controls">
                <button type="button" class="svg-wrapper-style" data-action="open-flowchart-options" data-tip="choose which properties the flowchart uses">
                    <svg viewBox="0 0 50 50"><use href="#icon-flowchart"></use></svg>
                </button>
            </div>`;
}
