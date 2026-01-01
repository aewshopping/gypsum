import { renderActiveTags } from "./render-active-tags.js";
import { appState } from "../../services/store.js";
import { renderFileList_grid } from "../render-file-list-grid.js";
import { renderFileList_table} from "../render-file-list-table.js";
import { VIEWS } from "../../constants.js";

export function renderData() {
    renderActiveFiles();
//    addActionHandlers();
    renderActiveTags();
}

function renderActiveFiles() {

    const outputElement = document.getElementById("output");
    switch(appState.viewState) {
        case VIEWS.CARDS:
            renderFileList_grid();
            break;
        case VIEWS.TABLE:
            renderFileList_table();
            break;
        default:
            renderFileList_grid();
            break;
    }
}