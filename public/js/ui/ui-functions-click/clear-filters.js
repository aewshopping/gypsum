import { appState } from '../../services/store.js';
import { renderData } from '../ui-functions-render/render-all-files.js';


/**
 * Clears all active filters, resets the search box, and re-renders the data.
 * It clears the `filterTags` and `filterString` from the `appState`,
 * sets the `show` property of all files to `true`, and clears the search box input.
 */
export function handleClearFilters() {
    const searchBox = document.getElementById("searchbox");

    appState.filterTags.clear();
    appState.filterString = "";

    appState.myFiles.forEach((file) => {
        file.show = true;
    });

    searchBox.value = "";

    renderData(false);

}