/**
 * @file Opens and closes the recent files side panel.
 *
 * Both handlers go through a view transition, because the panel's width is subtracted from the
 * page: the page is laid out once at its new width and a picture of the old one is animated into
 * it, rather than the body's padding being recalculated on every frame of a 250ms slide. See
 * sidebar-push.css for the groups, and view-transition.js for what "animate view changes" off
 * does to it.
 */

import { withViewTransition } from '../ui-functions-render/view-transition.js';

/**
 * Runs a change to the panel's state as an animated slide.
 *
 * The class naming the transition's groups is added before the capture and removed once the
 * animation is over — a name that stayed on would join every other view transition in the app.
 *
 * @param {Function} update - Opens or closes the panel.
 * @returns {void}
 */
function slidePanel(update) {
    const root = document.documentElement;
    root.classList.add('sidebar-animating');
    withViewTransition(update).finished
        .finally(() => root.classList.remove('sidebar-animating'));
}

/**
 * Opens the recent files panel, or closes it again if it is already open. This button sits in the
 * page toolbar, so clicking it takes focus out of the panel of its own accord.
 * @returns {void}
 */
export function handleToggleRecentPanel() {
    slidePanel(() => document.documentElement.classList.toggle('sidebar-recent-open'));
}

/**
 * Closes the recent files panel from the button inside it.
 *
 * Focus has to leave the panel, which is held open for as long as anything inside it is focused —
 * so a close button that kept focus after being clicked would close nothing. Hence the blur before
 * the focus rather than the focus alone: the toolbar button is on the page, which an open file
 * makes inert, and an inert element cannot take focus.
 *
 * **Focus moves first, and outside the transition.** A view transition's update runs a frame or
 * two after it is asked for, so a focus moved in there lands after whatever the user or the app did
 * next and takes it back. Moving focus here changes nothing on screen: the panel is held open by
 * the class as well, so it stays open until the update removes it, which is what the capture sees.
 *
 * @param {Event} evt - The click event.
 * @param {HTMLElement} actionElement - The close button.
 * @returns {void}
 */
export function handleCloseRecentPanel(evt, actionElement) {
    actionElement.blur();
    document.getElementById('btn-recent-toggle').focus();
    slidePanel(() => document.documentElement.classList.remove('sidebar-recent-open'));
}
