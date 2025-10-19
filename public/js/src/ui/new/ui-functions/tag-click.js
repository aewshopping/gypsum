// This is designed to work with CSS doing the heavy lifting of hiding and showing. Will need a rewrite when no longer rendereing everything on one page.

import { NOTE, TAGGER, HIDER, AND_HIDER } from '../../../constants.js';
import { state } from '../../../services/store.js';
import { handleClearFilters } from './clear-filters.js';

export function handleTagClick(evt, target) {
    console.log("tag click")

 //   evt.preventDefault(); // stops the details div opening
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

    const notesNodes = document.querySelectorAll(`.${NOTE}`);
    for (const elem of notesNodes) {
        const ANDcount = elem.querySelectorAll(`.${NOTE} .${TAGGER}`).length; // count tag matches
        elem.classList.add(HIDER); // hides notes without selected tags through css. Applied here not onload so you can see all notes at start

        if (ANDcount < state.filter_counter) {
            elem.classList.add(AND_HIDER);
        } else {
            elem.classList.remove(AND_HIDER);
        }
    }

    if (state.filter_counter === 0) {
        handleClearFilters();
    }

}