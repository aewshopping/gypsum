/**
 * Wraps the first occurrence of query (case-insensitive) in tag with a <b> element.
 * Tag names are word characters only, so no HTML escaping is needed.
 * @param {string} tag
 * @param {string} query
 * @returns {string}
 */
function highlightMatch(tag, query) {
    if (!query) return tag;
    const i = tag.toLowerCase().indexOf(query.toLowerCase());
    if (i === -1) return tag;
    return tag.slice(0, i) + '<b>' + tag.slice(i, i + query.length) + '</b>' + tag.slice(i + query.length);
}

/**
 * Builds the list of item elements and attaches mousedown handlers.
 * @param {HTMLElement} popup
 * @param {string[]} items
 * @param {string} query - The active search query, used to bold the matching substring.
 * @param {function(string): void} onSelect
 */
function _buildItems(popup, items, query, onSelect) {
    popup.innerHTML = '';
    for (const tag of items) {
        const item = document.createElement('div');
        item.className = 'tag-autocomplete-item';
        item.dataset.tag = tag;
        item.innerHTML = highlightMatch(tag, query);
        // mousedown fires before blur — preventDefault keeps caret in editor
        item.addEventListener('mousedown', (evt) => { evt.preventDefault(); onSelect(tag); });
        popup.appendChild(item);
    }
}

/**
 * Creates the autocomplete popup, appends it to parentEl, and anchors it via CSS.
 * @param {string[]} items - Tag strings to display.
 * @param {HTMLElement} parentEl - Dialog element (editor) or document.body (searchbox).
 * @param {string} anchorName - CSS anchor name, e.g. '--tag-ac-editor'.
 * @param {function(string): void} onSelect - Called with chosen tag on click.
 * @param {string} query - The active search query, used to bold the matching substring.
 * @returns {HTMLElement}
 */
export function createPopup(items, parentEl, anchorName, onSelect, query) {
    const popup = document.createElement('div');
    popup.className = 'tag-autocomplete-popup';
    popup.style.setProperty('position-anchor', anchorName);
    _buildItems(popup, items, query, onSelect);
    parentEl.appendChild(popup);
    return popup;
}

/**
 * Replaces popup contents with a new item list.
 * @param {HTMLElement} popup
 * @param {string[]} items
 * @param {function(string): void} onSelect
 * @param {string} query - The active search query, used to bold the matching substring.
 * @returns {void}
 */
export function repopulatePopup(popup, items, onSelect, query) {
    _buildItems(popup, items, query, onSelect);
}

/**
 * Removes the popup from the DOM.
 * @param {HTMLElement|null} popup
 * @returns {void}
 */
export function destroyPopup(popup) { popup?.remove(); }

/**
 * Moves the data-active highlight to the next or previous item and scrolls it into view.
 * @param {HTMLElement} popup
 * @param {'next'|'prev'} direction
 * @returns {void}
 */
export function moveActiveItem(popup, direction) {
    const items = [...popup.querySelectorAll('.tag-autocomplete-item')];
    if (!items.length) return;

    const activeIdx = items.findIndex(el => el.dataset.active === 'true');

    let nextIdx;
    if (direction === 'next') {
        nextIdx = activeIdx === -1 ? 0 : Math.min(activeIdx + 1, items.length - 1);
    } else {
        nextIdx = activeIdx <= 0 ? 0 : activeIdx - 1;
    }

    if (activeIdx !== -1) delete items[activeIdx].dataset.active;
    items[nextIdx].dataset.active = 'true';
    items[nextIdx].scrollIntoView({ block: 'nearest' });
}

/**
 * Returns the tag string of the currently active item, or null if none.
 * @param {HTMLElement} popup
 * @returns {string|null}
 */
export function getActiveTag(popup) {
    return popup.querySelector('[data-active="true"]')?.dataset.tag ?? null;
}
