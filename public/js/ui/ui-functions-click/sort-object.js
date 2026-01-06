import { sortAppStateFiles } from '../../services/file-object-sort.js';
import { appState, FILE_PROPERTIES, propertySortMap } from '../../services/store.js';
import { renderFileList_table } from '../render-file-list-table.js';
import { renderData } from '../ui-functions-render/render-all-files.js';

// this function is fired by clicking on an element that also has a data-property="something" on that element.
// it looks up the property type (defaulting to string if property not in the FILE_PROPERTIES object), and also figures out the sort direction.
// then calls the sort myFiles object function with these parameters, then finally calls a re-render of the page.
// stores the property that has just been sorted and a direction in a map, so that it can be referenced in future to flip the sort direction (ie if you click the same property again).

export function handleSortObject(evt, element){

    const sortProp = element.dataset.property;
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
    // then render on this sorted object (only table rows hence false arg)
    renderData(false);

    // appState.sortState with current sort state
    Object.assign(currentSort, { property: sortProp, direction: sortDirection });

    // add to or update the propertySortMap, depending on whether property already exists (update), or doesn't (add)
    propertySortMap.set(currentSort.property, currentSort)
    

}

