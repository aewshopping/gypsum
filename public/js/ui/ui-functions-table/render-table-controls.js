import { appState } from '../../services/store.js';

/** What the control row calls the app's built-in defaults, where a saved layout would be named. */
export const DEFAULT_LAYOUT_LABEL = 'app defaults';

/**
 * Renders the table's control row: buttons acting on the table as a whole rather than on any
 * one column. Emitted with the table, so it comes and goes with the view.
 *
 * The layout name sits beside the columns button as text rather than as a control — no box, no
 * border, the weight of a label. It says what shape the table is in, which is worth a permanent
 * line, and asks for nothing until it is clicked.
 *
 * It reads appState rather than the disk, because a renderer has to stay synchronous: the list of
 * layouts is refreshed into state by layout-file.js when the folder loads and after every save,
 * rename or delete.
 *
 * @returns {string} HTML string for the control row.
 */
export function renderTableControls() {
    const active = appState.tableLayouts.active ?? DEFAULT_LAYOUT_LABEL;

    return `
            <div class="table-controls">
                <button type="button" class="svg-wrapper-style" data-action="open-column-picker" data-tip="show and hide columns">
                    <svg viewBox="0 0 50 50"><use href="#icon-columns"></use></svg>
                </button>
                <button type="button" id="layout-menu-btn" class="layout-name" popovertarget="layout-menu"
                        data-action="layout-menu-open" data-tip="saved table layouts">${active}<span class="layout-name-caret">▾</span></button>
            </div>`;
}
