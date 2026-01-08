import { appState } from '../../services/store.js';
import { renderData } from '../ui-functions-render/render-all-files.js';
import { getFilterParameters } from './search-filter-prep.js';
import { shouldFileBeShown } from './search-file-show-check.js';


/**
 * Iterates through all notes in appState.myFiles and updates their 'show' key
 * based on the currently selected tags and search string.
 */
export function updateMyFilesShowState() {
    
    // 1. Calculate filter parameters ONLY ONCE
    const filters = getFilterParameters();

    // Performance Optimization: Short-circuit the main loop if no filters are active.
    if (!filters.hasTagFilters && !filters.hasStringFilter) {
        appState.myFiles.forEach(file => {
            file.show = true;
        });
        renderData(false);
        return;
    }

    // 2. Core Logic: Iterate and apply the clean, isolated filter function.
    appState.myFiles.forEach(file => {
        file.show = shouldFileBeShown(file, filters);
    });

    // 3. Trigger the UI update (assuming renderData is available globally).
    renderData(false);
}


