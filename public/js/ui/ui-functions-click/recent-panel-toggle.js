/**
 * @file Opens and closes the recent files side panel.
 */

/**
 * Opens the recent files panel, or closes it again if it is already open.
 *
 * The blur on the way closed matters because the tab is inside the panel: focus anywhere in there
 * holds the panel open, so a tab that kept focus after being clicked could never close anything.
 * @param {Event} evt - The click event.
 * @param {HTMLElement} actionElement - The tab.
 * @returns {void}
 */
export function handleToggleRecentPanel(evt, actionElement) {
    const nowOpen = document.documentElement.classList.toggle('sidebar-recent-open');
    if (!nowOpen) actionElement.blur();
}
