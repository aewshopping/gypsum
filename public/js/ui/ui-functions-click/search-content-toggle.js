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