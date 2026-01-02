import { VIEWS } from "../constants.js";

export const appState = {
  myFiles: [],
  myFilesProperties: new Map(), // to build table view, with columns including yaml data
  myTags: [],
  filterMode: 'OR', // 'AND' or 'OR'
  filterTags: new Set(),
  myTaxonomy: [],
  viewState: VIEWS.TABLE.value, // sets initial view state
  sortState: { property: 'filename', direction: 'desc'}
}

export const propertySortMap = new Map();

// defines the properties of the file objects
export const FILE_PROPERTIES = {
  sizeInBytes: { type: 'number', column_width: 120, display_order: 6 },
  id: { type: 'number', column_width: 40, display_order: 1 },
  title: { type: 'string', column_width: 350, display_order: 2 },
  filename: { type: 'string', column_width: 250, display_order: 1 },
  lastModified: { type: 'date', column_width: 150, display_order: 4 },
  modified: { type: 'date', column_width: 150, display_order: 4 },
  tags: { type: 'array', column_width: 200, display_order: 3 },
  tags_parent: { type: 'array', column_width: 250, display_order: 10 },
  date: { type: 'date', column_width: 150, display_order: 5 },
  phone: { type: 'array', column_width: 200, display_order: 8 },
  email: { type: 'array', column_width: 200, display_order: 7 },
  color: { type: 'string', column_width: 0, display_order: 11 },
  fileHandle: { type: 'object', column_width: 0, display_order: 99 },
  show: { type: 'boolean', column_width: 0, display_order: 99 },
  content: { type: 'string', column_width: 0, display_order: 99 },
};

// defines the columns that will be shown in the table view
export const TABLE_VIEW_COLUMNS = { // note all properties will be shown in the table *except* these ones
  hidden_always: ['handle', 'show', 'content'],
  hidden_at_start: ['id', 'tags_parent'], // could in future add check box functionality to show current cols ticked and these cols unticked
};