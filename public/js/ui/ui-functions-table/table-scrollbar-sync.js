/**
 * Synchronizes the width of the top scrollbar's content div with the table's actual scroll width.
 * This ensures the scrollbar accurately represents the full width of the table content.
 * @param {object} elements - An object containing the DOM elements for the top scrollbar and table.
 */
function syncWidth(elements) {
// The content inside the top scrollbar must match the width of the table.
// Using the header's scrollWidth as the reference for the full width.
   
  // Get the scrollable content width from the header div.
  const contentWidth = elements.tableHeader.scrollWidth; 
  
  // Set the width of the empty div inside the top scrollbar container.
  // This ensures the top scrollbar's thumb (slider) matches the "real" one.
  elements.topScrollContent.style.width = contentWidth + 'px';
}

/**
 * Initializes the synchronization of a custom top scrollbar with the main table's horizontal scroll.
 * It finds the necessary DOM elements, performs an initial width sync, and attaches the required scroll event listeners.
 */
export function initialScrollSync() {

    const topScrollbar = document.getElementById('top-scrollbar-container');
    const tableWrapper = document.querySelector('.list-table'); // This is the main content container that needs horizontal scrolling
    const tableHeader = document.querySelector('.note-table-header'); // USing the header's width to determine the total scroll width
    const topScrollContent = document.getElementById('top-scrollbar-content');

    const elements = { topScrollbar, tableWrapper, tableHeader, topScrollContent };

    // debugging in case any of the elements above can't be found
    for (const key in elements) {
        if (!elements[key]) {
            console.error(`[ScrollSync Error] Element not found: ${key} (Selector: ${key === 'tableHeader' ? '.note-table-header' : '#' + key})`);
            return; // Stop execution if an element is missing
        }
    }

    // Initial sync when table first rendered
    syncWidth(elements);
    addScrollEventListeners(elements)
}

/**
 * Adds the necessary event listeners to synchronize scrolling between the top scrollbar and the table.
 * It also includes a resize listener to re-synchronize widths if the window size changes.
 * @param {object} elements - An object containing the DOM elements for the top scrollbar and table.
 */
function addScrollEventListeners(elements) {

    const topScrollbar = elements.topScrollbar;
    const tableWrapper = elements.tableWrapper;
    const tableHeader = elements.tableHeader;

    // Re-sync on window resize (important if content or viewport changes)
    window.addEventListener('resize', syncWidth(elements));


    // --- Synchronize Scroll Events ---

    // When the top scrollbar is scrolled, scroll the table content.
    topScrollbar.addEventListener('scroll', () => {
        // Get the new scroll position
        const newScrollLeft = topScrollbar.scrollLeft;

        // Apply the horizontal scroll to the main content wrapper
        tableWrapper.scrollLeft = newScrollLeft;
        
    });

    // When the table content is scrolled (by user swiping/using default scrollbar), scroll the top bar too.
    tableWrapper.addEventListener('scroll', () => {
        // Get the new scroll position from the main scrolling element
        const newScrollLeft = tableWrapper.scrollLeft;

        // Apply the horizontal scroll to the top scrollbar container
        topScrollbar.scrollLeft = newScrollLeft;
    });
}