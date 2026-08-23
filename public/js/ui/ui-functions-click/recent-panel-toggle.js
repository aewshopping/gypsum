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
 *
 * Hence the blur before the focus, rather than the focus alone. The opener sits on the page, which
 * an open file makes inert, and an inert element cannot take focus — so with a file open the focus
 * call does nothing and the close button would keep hold of it.
 * @param {Event} evt - The click event.
 * @param {HTMLElement} actionElement - The close button.
 * @returns {void}
 */
export function handleCloseRecentPanel(evt, actionElement) {
    document.documentElement.classList.remove('sidebar-recent-open');
    actionElement.blur();
    document.getElementById('btn-recent-open').focus();
}
