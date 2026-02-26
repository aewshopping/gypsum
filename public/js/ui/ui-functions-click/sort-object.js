import { sortAppStateFiles } from '../../services/file-object-sort.js';
import { appState, FILE_PROPERTIES, propertySortMap } from '../../services/store.js';
import { renderFileList_table } from '../render-file-list-table.js';
import { renderData } from '../ui-functions-render/a-render-all-files.js';

/**
 * Handles the click event to sort the file list by a specific property.
 * It determines the property type, calculates the next sort direction (toggling if necessary),
 * sorts the files in the app state, and triggers a re-render.
 * @function handleSortObject
 * @param {Event} evt - The click event.
 * @param {HTMLElement} element - The element that triggered the sort, which must have a `data-property` attribute.
 * @returns {void}
 */
export function handleSortObject(evt, element){

    const sortProp = element.dataset.property;
    const sortType = FILE_PROPERTIES.get(sortProp)?.type ?? "string"; // string as default for undefined properties
    let sortDirection = "";

    // get the currentSort for later updating
    const currentSort = appState.sortState;
    
    // check if we have a prior sort direction for this property, if we do then flip it. If not then set to "asc".
    const previousSort = propertySortMap.get(currentSort.property);
    if (!previousSort) {
        sortDirection = "asc";
    } else {
        switch (previousSort.direction) {
            case "asc":
                sortDirection = "desc";
                break;
            case "desc":
                sortDirection = "asc"
                break;
            default:
                sortDirection = "asc"
                break;
        }
    }

    // sort the appState.myFiles object with the selected property, type and direction.
    sortAppStateFiles(sortProp, sortType, sortDirection);
    // then render on this sorted object (only table rows hence false arg)
    renderData(false);

    // appState.sortState with current sort state
    Object.assign(currentSort, { property: sortProp, direction: sortDirection });

    // add to or update the propertySortMap, depending on whether property already exists (update), or doesn't (add)
    propertySortMap.set(currentSort.property, currentSort)
    

}

