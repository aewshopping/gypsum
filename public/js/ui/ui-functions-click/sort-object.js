import { sortAppStateFiles } from '../../services/file-object-sort.js';
import { renderData } from '../ui-functions-render/render-all-files.js';
import { appState, FILE_PROPERTIES, propertySortMap } from '../../services/store.js';

export function handleSortObject(evt, element){

    const sortProp = element.dataset["property"];
    const sortType = FILE_PROPERTIES[sortProp]?.type ?? "string"; // string as default for undefined properties
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
    // then render on this sorted object
    renderData();

    // appState.sortState with current sort state
    Object.assign(currentSort, { property: sortProp, direction: sortDirection });

    // add to or update the propertySortMap, depending on whether property already exists (update), or doesn't (add)
    propertySortMap.set(currentSort.property, currentSort)
    

}

