import { COPYATTR } from '../../constants.js';

// because we are bubbling up the evt listenner need to specify target not use evt.target. This is because if the evt was triggered by a child element it would be the child element that would be targeted with evt.parent not the event that is actually associated with the listener
export function handleCopyClick(evt, target) {

    evt.preventDefault(); // stops the details div opening

    const copytext = target.dataset[COPYATTR];

    navigator.clipboard.writeText(copytext);

    target.classList.toggle("copied");

}