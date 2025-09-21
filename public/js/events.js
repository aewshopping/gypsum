import { state } from './state.js';
import { TAGGER, HIDER, AND_HIDER, NOTE, COPYTHIS, COPYATTR } from './constants.js';
import { qsa, getById } from './dom.js';

function clearFilters() {
    state.filter_counter = 0;
    qsa(`.${NOTE}`).forEach(el => el.classList.remove(HIDER, AND_HIDER));
    qsa(`.${TAGGER}`).forEach(el => el.classList.remove(TAGGER));
}

function clickHandler(evt) {
    // TAG CLICK EVENT
    if (evt.target.classList.contains("tag")) {
        evt.preventDefault(); // stops the details div opening
        const targetTag = evt.target.classList[0] + " " + evt.target.classList[1]; // ie all elements with class "tag" and "some tag name". BETTER WAY OF DOING THIS? BIT ROPEY
        const matchTagElements = document.getElementsByClassName(targetTag);

        // highlights selected tags through css class
        for (let q = 0; q < matchTagElements.length; q++) {
            let onOff = matchTagElements[q].classList.toggle(TAGGER);
            if (onOff === true && q === 0) {
                state.filter_counter++;
                // console.log(onOff + " index:" + q + "counter: " + state.filter_counter);
            } else if (onOff === false && q === 0) {
                state.filter_counter--;
                // console.log(onOff + " index:" + q + "counter: " + state.filter_counter);
            }
        }

        const notesNodes = qsa(`.${NOTE}`);
        for (const elem of notesNodes) {
            const ANDcount = elem.querySelectorAll(`summary .${TAGGER}`).length; // count tag matches
            elem.classList.add(HIDER); // hides notes without selected tags through css. Applied here not onload so you can see all notes at start

            if (ANDcount < state.filter_counter) {
                elem.classList.add(AND_HIDER);
            } else {
                elem.classList.remove(AND_HIDER);
            }
        }

        if (state.filter_counter === 0) {
            clearFilters();
        }
    // CLEAR FILTERS CLICK EVENT
    } else if (evt.target.classList.contains("showall")) {
        clearFilters();
    // COPY FILENAME CLICK EVENT
    } else if (evt.target.classList.contains(COPYTHIS)) {
        evt.preventDefault(); // stops the details div opening
        const COPYTEXT = evt.target.dataset[COPYATTR];
        navigator.clipboard.writeText(COPYTEXT);
        evt.target.classList.toggle("copied");
    }
    // console.log("counter evt end: " + state.filter_counter);
}

export function addClickHandlers() {
    // document.addEventListener('pointerdown', clickHandler, true); // captures touch but prevent default only works erratically! Also doesn't distinguish between left and right clicks
    document.addEventListener("click", clickHandler);
}
