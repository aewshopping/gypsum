/**
 * Handles the toggling of the content search feature.
 * It updates the placeholder text of the search box to indicate
 * whether the search will include file content, which can be slower.
 * @param {Event} evt The change event object from the toggle switch.
 * @param {HTMLElement} target The toggle switch element.
 */
export function handleContentSearchToggle(evt, target) {
    
    const searchbox = document.getElementById("searchbox");

    if (target.checked) {
        console.log("on");
        searchbox.placeholder = " search... file content (slow) "

    } else {

        console.log("off");
        searchbox.placeholder=' search... "with space or" property:value '
    }
}