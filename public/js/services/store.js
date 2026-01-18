import { VIEWS } from "../constants.js";

/**
 * @file Centralized state management for the application.
 * Defines the application's state object, data structures, and constants.
 */

/**
 * The main application state.
 * @type {object}
 * @property {Array<object>} myFiles - An array of file objects, each containing metadata and content.
 * @property {Map<string, object>} myFilesProperties - A map of all unique properties found across all files.
 * @property {Array<[string, number]>} myTags - An array of unique tags and their counts.
 * @property {string} filterMode - The current tag filtering mode ('AND' or 'OR').
 * @property {Set<string>} filterTags - A set of tags currently used for filtering.
 * @property {string} filterString - The current string used for text-based filtering.
 * @property {Array<[string, Array<[string, number]>]>} myTaxonomy - The hierarchical tag structure.
 * @property {string} viewState - The current view mode (e.g., 'cards', 'table').
 * @property {{property: string, direction: string}} sortState - The current sorting state.
 */
export const appState = {
  myFiles: [],
  myFilesProperties: new Map(), // to build table view, with columns including yaml data. Only includes *actual* props from files hence different to FILE_PROPERTIES map
  myTags: [],
  myTaxonomy: [],
  filterMode: 'OR', // 'AND' or 'OR' // **REMOVE LATER**
  filterTags: new Set(), // **REMOVE LATER**
  filterString: "", // **REMOVE LATER**
  search: {
    mode: 'onlyProperties', // allContent or onlyProperties // **REMOVE LATER**
    filterMode: 'OR', // 'AND' or 'OR'
    depth: {
      searchMode: "onlyProperties",
      prompt: {
        fullContent: " content search... (slower) ",
        onlyProperties: " search... with text or property:value "
      }
    },
    excludedProperties: ["handle", "show"],
    filters: new Map(),
    results: new Map(),
    matchingFiles: new Map()
  },

  viewState: VIEWS.CARDS.value, // sets initial view state
  sortState: { property: 'filename', direction: 'desc'}
}

/**
 * A map to store the current sort direction for each property.
 * @type {Map<string, string>}
 */
export const propertySortMap = new Map();


/**
 * Defines metadata for known - or potential - file object properties.
 * This is used to assign values to properties later (ie for sorting or rendering).
 * Should probably change this to an object so it is easier to load in new values later
 * @type {Map<string, {type: string, column_width: number, display_order: number}>}
 */
export const FILE_PROPERTIES = new Map([
  ['sizeInBytes', {label: 'size', type: 'number', column_width: 120, display_order: 6 }],
  ['id', { type: 'number', column_width: 40, display_order: 1 }],
  ['title', { type: 'string', column_width: 350, display_order: 2 }],
  ['filename', { type: 'string', column_width: 250, display_order: 1 }],
  ['lastModified', {label: 'last modified', type: 'date', column_width: 150, display_order: 4 }],
  ['tags', { type: 'array', column_width: 200, display_order: 3 }],
  ['tags_parent', { type: 'array', column_width: 250, display_order: 10 }],
  ['date', { type: 'date', column_width: 150, display_order: 5 }],
  ['phone', { type: 'array', column_width: 200, display_order: 8 }],
  ['email', { type: 'array', column_width: 200, display_order: 7 }],
  ['color', { type: 'string', column_width: 0, display_order: 11 }],
  ['people', { type: 'array', sort_type: 'string', column_width: 250, display_order: 9 }]
]);

/**
 * Defines which columns are hidden in the table view.
 * @type {object}
 * @property {Array<string>} hidden_always - Properties that are never shown in the table.
 * @property {Array<string>} hidden_at_start - Properties that are hidden by default but can be shown.
 * @property {Array<object>} current_props - The fully-resolved properties of the currently visible columns.
 */
export const TABLE_VIEW_COLUMNS = { // note all properties will be shown in the table *except* these ones
  hidden_always: ['handle', 'show', 'content'],
  hidden_at_start: ['id', 'tags_parent', 'color'], // could in future add check box functionality to show current cols ticked and these cols unticked
  current_props: [],
};
