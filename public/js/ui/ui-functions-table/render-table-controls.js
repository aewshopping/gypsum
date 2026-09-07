/**
 * Renders the table's control row: buttons acting on the table as a whole rather than on any
 * one column. Emitted with the table, so it comes and goes with the view.
 *
 * One button today. It is named for the row rather than for that button because the JSON export
 * and the other table-wide actions belong here alongside it.
 *
 * @returns {string} HTML string for the control row.
 */
export function renderTableControls() {
    return `
            <div class="table-controls">
                <button type="button" class="svg-wrapper-style" data-action="open-column-picker" data-tip="show and hide columns">
                    <svg viewBox="0 0 50 50"><use href="#icon-columns"></use></svg>
                </button>
            </div>`;
}
