

/**
 * Handles the toggle event for entering or exiting fullscreen mode.
 * @function handleFullscreenToggle
 * @param {Event} evt - The change event.
 * @param {HTMLInputElement} target - The checkbox element.
 * @returns {void}
 */
export function handleFullscreenToggle(evt, target) {

    console.log("fullscreen");

    const element = document.documentElement;

    if (target.checked) {
                
        element.requestFullscreen();

    } else {

        document.exitFullscreen();

    }

}