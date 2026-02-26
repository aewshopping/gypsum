/**
 * Synchronizes the width of the top scrollbar with the width of the table.
 *
 * @function syncWidth
 * @param {object} elements An object containing the table header and top scrollbar content elements.
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
 * Initializes the scrollbar synchronization.
 * @function initialScrollSync
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
 * Adds scroll event listeners to the top scrollbar and table wrapper to keep them in sync.
 *
 * @function addScrollEventListeners
 * @param {object} elements An object containing the top scrollbar and table wrapper elements.
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