
const searchBox = document.getElementById("searchbox")

export function handleSearchBoxClick() {
    const searchString = searchBox.value;
    console.log("starting seachbox search for " + searchString);
}

export function handleSearchBoxEnterPress(target) {
    if (target.key === "Enter") {
        handleSearchBoxClick();
    }
}