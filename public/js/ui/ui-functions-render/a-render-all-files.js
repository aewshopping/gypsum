import { appState } from "../../services/store.js";
import { renderFileList_grid } from "../render-file-list-grid.js";
import { renderFileList_table } from "../render-file-list-table.js";
import { renderFileList_list } from "../render-file-list-list.js";
import { countActiveFilters } from "../ui-functions-search/a-count-activefilters.js";
import { VIEWS } from "../../constants.js";
import { applyHighlights } from "../ui-functions-highlight/apply-highlights.js";

export function renderData(fullRender = true) {

    renderFiles(fullRender);

}

export function renderFiles(fullRender = true) {

    // check if no active filters applied
    const activeFilterCount = countActiveFilters();
    let renderEverything = "";
    if (activeFilterCount === 0 || appState.search.filters.size === 0) {
        renderEverything = true;
     }

//    const outputElement = document.getElementById("output");
    switch(appState.viewState) {
        case VIEWS.CARDS.value:
            renderFileList_grid(renderEverything);
            break;
        case VIEWS.TABLE.value:
            renderFileList_table(renderEverything, fullRender);
            break;
        case VIEWS.LIST.value:
            renderFileList_list(renderEverything);
            break;
        default:
            renderFileList_grid(renderEverything);
            break;
    }

    applyHighlights(); // need to apply again because we have a complete refresh of output html

}
