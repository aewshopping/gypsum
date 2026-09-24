import { appState } from '../../services/store.js';
import { describeBatch } from '../../table-undo/describe-batch.js';
import { escapeHtml } from '../ui-functions-render/escape-html.js';

/**
 * Draws the undo list: one row per batch on the undo stack, newest first, then "clear undo history".
 *
 * **A row is a button, and pressing it undoes that batch** — any one of them, not only the newest.
 * That is safe for the reason every undo is: each edit is reversed only where the note still says
 * what the edit left. plans/table-delete-column.md §10.
 *
 * **The "earlier" divider** falls between the last batch made in this visit to the table and the
 * first one made before it, which is where Ctrl+Z's reach ends (§10.4). It is drawn only when there
 * are entries on both sides of it, which makes it the one place the app says why undo is dark.
 *
 * The rows scroll inside themselves; the clear row sits outside them so it is always in view.
 *
 * @param {number} [now] - The time to measure "2 min" from; the present when left out.
 * @returns {string} HTML for the inside of #undo-list.
 */
export function renderUndoList(now = Date.now()) {
    const stack = appState.undoStack;
    const rows = [];
    let dividerDrawn = false;

    for (let index = stack.length - 1; index >= 0; index--) {
        const batch = stack[index];
        const earlier = batch.timestamp < appState.undoHorizon;
        if (earlier && !dividerDrawn && index < stack.length - 1) {
            rows.push('<div class="undo-list-divider" role="separator"><span>earlier</span></div>');
        }
        if (earlier) dividerDrawn = true;

        rows.push(`<button type="button" class="app-menu-item undo-list-row" data-action="undo-list-item" data-index="${index}">`
            + `<span class="undo-list-name">${escapeHtml(describeBatch(batch))}</span>`
            + `<span class="undo-list-time">${relativeTime(batch.timestamp, now)}</span>`
            + '</button>');
    }

    return `<div class="undo-list-rows">${rows.join('')}</div>`
        + '<button type="button" class="app-menu-item undo-list-clear" data-action="undo-list-clear" data-tip="forget every entry in this list">clear undo history</button>';
}

/**
 * When a batch was made, in the fewest words that place it: `just now`, `5 min`, `3 h`,
 * `yesterday`, then a date. Here rather than in a helper of its own, having one caller.
 * @param {number} timestamp
 * @param {number} now
 * @returns {string}
 */
function relativeTime(timestamp, now) {
    const minutes = Math.floor((now - timestamp) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min`;

    const then = new Date(timestamp);
    const today = new Date(now);
    if (then.toDateString() === today.toDateString()) return `${Math.floor(minutes / 60)} h`;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (then.toDateString() === yesterday.toDateString()) return 'yesterday';

    return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
