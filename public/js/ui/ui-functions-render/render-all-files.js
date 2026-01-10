import { renderActiveTags } from "./render-active-tags.js";
import { appState } from "../../services/store.js";
import { renderFileList_grid } from "../render-file-list-grid.js";
import { renderFileList_table } from "../render-file-list-table.js";
import { renderFileList_list } from "../render-file-list-list.js";
import { highlightSearchResults } from "../ui-functions-search/search-highlight.js";
import { VIEWS } from "../../constants.js";

/**
 * Orchestrates the rendering of the main application view.
 * It calls the appropriate function to render the files based on the current view state,
 * updates the active tags' visual state, and highlights search results.
 * @param {boolean} [fullRender=true] - A flag to indicate if a full re-render is needed, passed down to specific view renderers.
 */
export function renderData(fullRender = true) {
    const searchString = appState.filterString;
    renderActiveFiles(fullRender);
//    addActionHandlers();
    renderActiveTags();

    highlightSearchResults(searchString, "#output");
}

/**
 * Renders the list of files based on the current view state.
 * It uses a switch statement to call the appropriate rendering function
 * (e.g., grid, table, list) depending on the value of `appState.viewState`.
 * @param {boolean} [fullRender=true] - Passed to the specific view renderer to control partial or full updates.
 */
function renderActiveFiles(fullRender = true) {

//    const outputElement = document.getElementById("output");
    switch(appState.viewState) {
        case VIEWS.CARDS.value:
            renderFileList_grid();
            break;
        case VIEWS.TABLE.value:
            renderFileList_table(fullRender);
            break;
        case VIEWS.LIST.value:
            renderFileList_list();
            break;
        default:
            renderFileList_grid();
            break;
    }
}