import { appState } from '../../services/store.js';
import { renderData } from '../ui-functions-render/render-all-files.js';

/**
 * Clears all active filters, including tags and search strings.
 * It resets the application state, clears the search box input,
 * and re-renders the file list to show all files.
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