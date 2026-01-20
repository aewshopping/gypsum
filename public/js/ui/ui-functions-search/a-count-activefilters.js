import { appState } from "../../services/store.js";


/**
 * Counts how many filters in the map have active set to true.
 * @returns {number}
 */
export function countActiveFilters() {
  const filters = appState.search.filters;
  let count = 0;

  for (const filterObj of filters.values()) {
    if (filterObj.active === true) {
      count++;
    }
  }

  return count;
}