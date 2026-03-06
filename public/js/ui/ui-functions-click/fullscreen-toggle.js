

/**
 * Handles the toggle event for entering or exiting fullscreen mode.
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

/**
 * Handles the toggle event for entering or exiting fullscreen mode for the file content modal.
 * @param {Event} evt - The click event.
 * @param {HTMLElement} target - The button element.
 * @returns {void}
 */
export function handleModalFullscreenToggle(evt, target) {

    const element = document.getElementById('file-content-modal');

    if (document.fullscreenElement !== element) {

        element.requestFullscreen();

    } else {

        document.exitFullscreen();

    }

}