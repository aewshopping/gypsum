import { appState } from "../../services/store.js";
import { createFilterObject } from "./a-create-filter-object.js";
import { searchFiles } from "./a-search-files.js";

export function searchOrchestrator(searchObject) {

    const filterId = createFilterObject(searchObject);

    console.log(searchObject);

    searchFiles(filterId);

    console.log(appState.search.results);

}