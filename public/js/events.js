import { state } from './state.js';
import { TAGGER, HIDER, AND_HIDER, NOTE, COPYTHIS, COPYATTR } from './constants.js';
import { qsa, getById } from './dom.js';

function clearFilters() {
    state.filter_counter = 0;
    qsa(`.${NOTE}`).forEach(el => el.classList.remove(HIDER, AND_HIDER));
    qsa(`.${TAGGER}`).forEach(el => el.classList.remove(TAGGER));
}

function clickHandler(evt) {
    if (evt.target.classList.contains("tag")) {
        evt.preventDefault();
        const targetTag = evt.target.classList[0] + " " + evt.target.classList[1];
        const matchTagElements = document.getElementsByClassName(targetTag);

        for (let q = 0; q < matchTagElements.length; q++) {
            let onOff = matchTagElements[q].classList.toggle(TAGGER);
            if (onOff === true && q === 0) {
                state.filter_counter++;
            } else if (onOff === false && q === 0) {
                state.filter_counter--;
            }
        }

        const notesNodes = qsa(`.${NOTE}`);
        for (const elem of notesNodes) {
            const ANDcount = elem.querySelectorAll(`summary .${TAGGER}`).length;
            elem.classList.add(HIDER);

            if (ANDcount < state.filter_counter) {
                elem.classList.add(AND_HIDER);
            } else {
                elem.classList.remove(AND_HIDER);
            }
        }

        if (state.filter_counter === 0) {
            clearFilters();
        }
    } else if (evt.target.classList.contains("showall")) {
        clearFilters();
    } else if (evt.target.classList.contains(COPYTHIS)) {
        evt.preventDefault();
        const COPYTEXT = evt.target.dataset[COPYATTR];
        navigator.clipboard.writeText(COPYTEXT);
        evt.target.classList.toggle("copied");
    }
}

export function addClickHandlers() {
    document.addEventListener("click", clickHandler);
}
