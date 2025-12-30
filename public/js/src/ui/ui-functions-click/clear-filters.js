import { NOTE, TAGGER, HIDER, AND_HIDER } from '../../constants.js';
import { appState } from '../../services/store.js';
import { renderData } from '../ui-functions-render/render-all-files.js';


export function handleClearFilters() {

    appState.filter_counter = 0;
    appState.filterTags.clear();

    // 2. Reset the 'show' status of all file objects (The specific request)
    appState.myFiles.forEach(file => {
        file.show = true;
    });    

    renderData();
    
    document.querySelectorAll(`.${NOTE}`).forEach(el => el.classList.remove(HIDER, AND_HIDER));

    document.querySelectorAll(`.${TAGGER}`).forEach(el => el.classList.remove(TAGGER));

}