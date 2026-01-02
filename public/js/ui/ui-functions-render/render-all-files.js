import { renderActiveTags } from "./render-active-tags.js";
import { appState } from "../../services/store.js";
import { renderFileList_grid } from "../render-file-list-grid.js";
import { renderFileList_table } from "../render-file-list-table.js";
import { renderFileList_list } from "../render-file-list-list.js";
import { VIEWS } from "../../constants.js";

export function renderData() {
    renderActiveFiles();
//    addActionHandlers();
    renderActiveTags();
}

function renderActiveFiles() {

//    const outputElement = document.getElementById("output");
    switch(appState.viewState) {
        case VIEWS.CARDS.value:
            renderFileList_grid();
            break;
        case VIEWS.TABLE.value:
            renderFileList_table();
            break;
        case VIEWS.LIST.value:
            renderFileList_list();
            break;
        default:
            renderFileList_grid();
            break;
    }
}