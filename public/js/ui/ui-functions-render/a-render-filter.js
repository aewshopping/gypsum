import { appState } from "../../services/store.js";

/**
 * Builds the HTML string for all active filter pills from current state.
 * @returns {string}
 */
function buildFilterHtml() {
    let html = "";
    for (const [filterId, filterObj] of appState.search.filters) {
        const isActive = filterObj.active === true ? "true" : "false";
        const isNegate = filterObj.negate === true ? "true" : "false";
        let propertyLabel = "";
        let operator = "";
        if (filterObj.property != "allProperties") {
            propertyLabel = filterObj.property;
            operator = filterObj.operator;
        }
        html += `<button class="tag filter-pill" data-filterid="${filterId}" data-action="filter-togglestate" data-active="${isActive}" data-negate="${isNegate}">${propertyLabel}${operator}${filterObj.searchValue}(${filterObj.matchCount})<button class="btn-delete-filter" data-filterid="${filterId}" data-action="delete-filter">✕</button></button>`;
    }
    return html;
}

/**
 * Inserts html into el and animates the height change.
 * @param {HTMLElement} el
 * @param {string} html
 * @returns {void}
 */
function insertAndAnimate(el, html) {
    // CSS cannot transition height to/from 'auto', so we compute explicit px values
    // before and after the DOM mutation and drive the transition in JS.
    const before = el.offsetHeight;
    el.style.transition = '';

    function animateTo(target, done) {
        // Guard: if height is unchanged (e.g. match-count update with same pill layout),
        // reset immediately — otherwise the explicit px height would prevent correct
        // re-layout on viewport resize.
        if (before === target) {
            el.style.height = 'auto';
            done?.();
            return;
        }
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.style.transition = 'height 0.3s ease';
                el.style.height = target + 'px';
            });
        });
        el.addEventListener('transitionend', () => {
            el.style.height = 'auto';
            el.style.transition = '';
            done?.();
        }, { once: true });
    }

    if (html === '') {
        // Animate to 0 before mutating: if we mutated first, the parent CSS
        // display:none (triggered by #filter-output:empty) would hide the element
        // before the animation could play.
        el.style.height = before + 'px';
        animateTo(0, () => { el.innerHTML = ''; });
    } else {
        el.innerHTML = html;
        // Temporarily release the height constraint so scrollHeight returns the
        // true natural content height. With an explicit height set, scrollHeight
        // returns max(clientHeight, contentHeight), which equals clientHeight when
        // content shrinks — making before === after and skipping the animation.
        el.style.height = 'auto';
        const after = el.scrollHeight;
        el.style.height = before + 'px';
        animateTo(after);
    }
}

/**
 * Renders the active search filters as a series of pills in the UI.
 * @returns {void}
 */
export function renderFilters() {
    const outputElement = document.getElementById("filter-output");
    insertAndAnimate(outputElement, buildFilterHtml());
}
