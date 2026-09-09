import { appState } from '../../services/store.js';
import { DEFAULT_LAYOUT_LABEL } from '../ui-functions-render/render-layout-list.js';

/**
 * Renders the table's control row: buttons acting on the table as a whole rather than on any
 * one column. Emitted with the table, so it comes and goes with the view.
 *
 * The layout name is a button in the app's ordinary `.btn-base-style`, labelled rather than
 * decorated: an earlier version was bare text with a caret, which read as a status line and not
 * as something to press. "layout:" sits outside it, so the button holds the name and nothing else.
 *
 * Save sits beside it and is never disabled. On a saved layout it writes over that layout; on the
 * defaults, which have no file behind them, it makes a new layout instead — the label stays
 * "save" because that is what the user asked for either way.
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
                <span class="layout-control-label">layout:</span>
                <button type="button" class="btn-base-style" data-action="open-layouts-modal" data-tip="saved table layouts">${active}</button>
                <button type="button" class="btn-base-style" data-action="layout-save" data-tip="save these columns to the layout in use">save</button>
            </div>`;
}
