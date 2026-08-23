/**
 * @file Opens and closes the recent files side panel.
 */

/**
 * Opens the recent files panel, or closes it again if it is already open.
 * @returns {void}
 */
export function handleToggleRecentPanel() {
    document.documentElement.classList.toggle('sidebar-recent-open');
}
