import { sortAppStateFiles } from '../../services/file-object-sort.js';
import { renderData } from '../ui-functions-render/render-all-files.js';

export function handleSortObject(evt, element){

    const sortProp = element.dataset["property"];

    sortAppStateFiles(sortProp, "string", "asc");
    renderData();

}