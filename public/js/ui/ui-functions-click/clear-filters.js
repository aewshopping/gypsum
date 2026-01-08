import { appState } from '../../services/store.js';
import { renderData } from '../ui-functions-render/render-all-files.js';


export function handleClearFilters() {
    const searchBox = document.getElementById("searchbox");

    appState.filterTags.clear();
    appState.myFiles.forEach((file) => {
        file.show = true;
    });

    searchBox.value = "";

    renderData(false);

}