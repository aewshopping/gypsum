import { renderData } from "../../../../main.js";
import { renderActiveTags } from "./render-active-tags.js";

export function renderAllFiles() {
    console.log("Rendering all files based on current filter settings.");
    renderData();
    renderActiveTags();
}