/**
 * @file Opens and closes the recent files side panel.
 */

/**
 * Opens the recent files panel.
 * @returns {void}
 */
export function handleOpenRecentPanel() {
    document.documentElement.classList.add('sidebar-recent-open');
}

/**
 * Closes the recent files panel, moving focus to the button that reopens it. Focus has to leave
 * the panel: it is held open for as long as anything inside it is focused, so a close button that
 * kept focus would keep the panel on screen.
 * @returns {void}
 */
export function handleCloseRecentPanel() {
    document.documentElement.classList.remove('sidebar-recent-open');
    document.getElementById('btn-recent-open').focus();
}
