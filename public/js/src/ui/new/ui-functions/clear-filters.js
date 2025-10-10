import { NOTE, TAGGER, HIDER, AND_HIDER } from '../../../constants.js';
import { state } from '../../../services/store.js';

export function handleClearFilters() {

    state.filter_counter = 0;

    document.querySelectorAll(`.${NOTE}`).forEach(el => el.classList.remove(HIDER, AND_HIDER));

    document.querySelectorAll(`.${TAGGER}`).forEach(el => el.classList.remove(TAGGER));

}