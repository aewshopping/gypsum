/**
 * @file Opens and closes the recent files side panel.
 */

/**
 * Opens the recent files panel, or closes it again if it is already open. This button sits in the
 * page toolbar, so clicking it takes focus out of the panel of its own accord.
 * @returns {void}
 */
export function handleToggleRecentPanel() {
    document.documentElement.classList.toggle('sidebar-recent-open');
}

/**
 * Closes the recent files panel from the button inside it.
 *
 * Focus has to leave the panel, which is held open for as long as anything inside it is focused —
 * so a close button that kept focus after being clicked would close nothing. Hence the blur before
 * the focus rather than the focus alone: the toolbar button is on the page, which an open file
 * makes inert, and an inert element cannot take focus.
 * @param {Event} evt - The click event.
 * @param {HTMLElement} actionElement - The close button.
 * @returns {void}
 */
export function handleCloseRecentPanel(evt, actionElement) {
    document.documentElement.classList.remove('sidebar-recent-open');
    actionElement.blur();
    document.getElementById('btn-recent-toggle').focus();
}
