import { appState } from './js/services/store.js';
import { initViewButtons } from './js/ui/ui-elements-load/view-buttons-load.js';
import { addActionHandlers } from './js/ui/event-listeners-add.js';

window.appState = appState; // exposed for debugging and tests

document.addEventListener('DOMContentLoaded', function () {

    initViewButtons();

    const searchbox = document.getElementById('searchbox');
    const searchmode = appState.search.depth.searchMode;
    searchbox.placeholder = appState.search.depth.prompt[searchmode];

    addActionHandlers();

});
