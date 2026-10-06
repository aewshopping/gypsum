import { appState } from '../../services/store.js';
import { VIEWS } from '../../constants.js';

/**
 * Draws a button per view into the side panel's Views section, numbered, and marks the current
 * one. The settings modal's Alt+number line is given the last number.
 * @returns {void}
 */
export function initViewButtons() {
    // Numbered here rather than in VIEWS, so a view's number is its place in the list and cannot
    // drift from the Alt+number that picks it (view-select-shortcut.js).
    document.getElementById('sidebar-views').innerHTML = Object.values(VIEWS).map((view, i) => `
      <button class="btn-menu" data-action="select-view" data-view="${view.value}" data-tip="${view.label} view | Alt+${i + 1}">
        <div class="svg-wrapper-style">
          <svg viewBox="0 0 50 50"><use href="#icon-view-${view.value}"></use></svg>
        </div>
        <span>${i + 1}. ${view.label}</span>
      </button>`).join('');
    document.getElementById('shortcut-last-view').textContent = Object.keys(VIEWS).length;

    markCurrentView();
}

/**
 * Marks the button of the view on screen as pressed, and lets every other one go.
 * @returns {void}
 */
export function markCurrentView() {
    for (const button of document.querySelectorAll('[data-action="select-view"]')) {
        button.setAttribute('aria-pressed', String(button.dataset.view === appState.viewState));
    }
}
