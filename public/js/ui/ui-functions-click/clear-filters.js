import { appState } from '../../services/store.js';
import { renderData } from '../ui-functions-render/render-all-files.js';


export function handleClearFilters() {

    appState.filterTags.clear();

    // 2. Reset the 'show' status of all file objects (The specific request)
    appState.myFiles.forEach(file => {
        file.show = true;
    });    

    renderData(false); // full render = false for table view where we only want to re render rows not header
    
}