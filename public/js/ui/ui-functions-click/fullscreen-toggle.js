

export function handleFullscreenToggle(evt, target) {

    console.log("fullscreen");

    const element = document.documentElement;

    if (target.checked) {
                
        element.requestFullscreen();

    } else {

        document.exitFullscreen();

    }

}