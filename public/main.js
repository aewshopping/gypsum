import { initOPFSButton } from './js/backup/opfs-import.js';
import { appState } from './js/services/store.js';
import { initSortSelect } from './js/ui/ui-elements-load/sort-select-load.js';
import { initViewSelect } from './js/ui/ui-elements-load/views-select-load.js';
import { addActionHandlers } from './js/ui/event-listeners-add.js';

window.appState = appState; // exposed for debugging and tests

document.addEventListener('DOMContentLoaded', function () {

    initViewSelect();
    initSortSelect();
    initOPFSButton();

    const searchbox = document.getElementById('searchbox');
    const searchmode = appState.search.depth.searchMode;
    searchbox.placeholder = appState.search.depth.prompt[searchmode];

    addActionHandlers();

});
