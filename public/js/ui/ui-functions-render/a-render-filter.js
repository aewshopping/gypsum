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
    el.style.height = before + 'px';

    el.innerHTML = html;

    const after = el.scrollHeight;

    // Guard: if height is unchanged (e.g. match-count update with same pill layout),
    // reset immediately — otherwise the explicit px height would prevent correct
    // re-layout on viewport resize.
    if (before === after) {
        el.style.height = 'auto';
        return;
    }

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.style.transition = 'height 0.3s ease';
            el.style.height = after + 'px';
        });
    });

    el.addEventListener('transitionend', () => {
        el.style.height = 'auto';
        el.style.transition = '';
    }, { once: true });
}

/**
 * Renders the active search filters as a series of pills in the UI.
 * @returns {void}
 */
export function renderFilters() {
    const outputElement = document.getElementById("filter-output");
    insertAndAnimate(outputElement, buildFilterHtml());
}
