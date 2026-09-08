import { VIEWS, DEFAULT_COLUMN_WIDTH } from "../constants.js";

/**
 * @file Centralized state management for the application.
 * Defines the application's state object, data structures, and constants.
 */

/**
 * The main application state.
 * @type {object}
 * @property {Array<object>} myFiles - An array of file objects, each containing metadata and content.
 * @property {Map<string, object>} myFilesProperties - A map of all unique properties found across all files.
 * @property {Map<string, Map<string, number>>} myParentMap - Hierarchical tag structure. Keys are parent tag
 *   names (plus 'orphan' and 'all'). Values are Map<childTag, count>. Ordered: named parents
 *   alphabetically, then 'orphan', then 'all'.
 * @property {string} viewState - The current view mode (e.g., 'cards', 'table').
 * @property {{property: string, direction: string}} sortState - The current sorting state.
 * @property {Set<string>} recentFiles - internalIds of files opened this session, most recently
 *   opened first. Each file appears once.
 */
export const appState = {
  myFiles: [],
  myFilesProperties: new Map(), // to build table view, with columns including yaml data. Only includes *actual* props from files hence different to FILE_PROPERTIES map
  myParentMap: new Map(),
  search: {
    filterMode: 'OR', // 'AND' or 'OR'
    depth: {
      searchMode: "onlyProperties",
      prompt: {
        fullContent: " content search... (slower) ",
        onlyProperties: " press / for search "
      }
    },
    excludedProperties: ["handle", "contentPeek", "errorOnLoad"],
    filters: new Map(),
    results: new Map(),
    matchingFiles: new Map()
  },

  viewState: VIEWS.PEEK.value, // sets initial view state
  sortState: { property: 'lastModified', direction: 'desc'},
  paginationState: {
    currentPage: 1,
    pageFileIds: new Set(),
  },

  editState: false,   // true = txt mode, false = html mode; drives the modal render toggle

  editSession: {
    activeRaw:      '',   // content currently displayed (current or historical)
    activeHtml:     '',
    liveRaw:        '',   // true current content (preserved during history browse)
    liveHtml:       '',
    openNormalized: '',   // \r\n-unified, trimEnd baseline set on file open
    openTextLen:    0,    // length of openNormalized without \n chars (fast-path gate)
    isDirty:        false,
  },

  isLoading: false,      // true while a load is in flight. Files are cleared and re-rendered at
                         // the start of a load, so this is what tells "loading" apart from
                         // "loaded, and the folder is empty" — see a-render-all-files.js

  dirHandle: null,       // FileSystemDirectoryHandle — set by directory loader, null otherwise
  openFileSnapshot: null,    // { filepath, filename, content } captured when modal opens
  closeSnapshot: null,   // { filepath, filename, content } captured just before modal closes
  historyEntries: [],    // backup entries for the currently-open file, newest-first

  tagTaxonomyVisible: false,  // true when the tag taxonomy is currently rendered in the DOM

  recentFiles: new Set(),  // internalIds of files opened this session, most recently opened first.
                           // Each file appears once: re-opening one moves it back to the top.

  // The saved table layouts for the loaded folder, read from .gypsum/table_layouts.gypsum.
  // `active` is the name of the layout in use, or null for the app's built-in defaults — a state
  // the user can choose, not the absence of a choice. Lives here rather than being read off the
  // disk on demand because render-table-controls.js is a renderer and has to stay synchronous.
  tableLayouts: { names: [], active: null },
}

/**
 * Defines metadata for known - or potential - file object properties.
 * This is used to assign values to properties later (ie for sorting or rendering).
 * Should probably change this to an object so it is easier to load in new values later
 * @type {Map<string, {type: string, column_width: number, display_order: number}>}
 */
export const FILE_PROPERTIES = new Map([
  ['sizeInBytes', {label: 'size', type: 'number', column_width: 120, display_order: 6 }],
  ['internalId', { label: 'file', type: 'string', column_width: 90, display_order: 0 }],
  ['title', { type: 'string', column_width: 350, display_order: 2 }],
  ['filename', { type: 'string', column_width: 250, display_order: 1 }],
  ['lastModified', {label: 'last modified', type: 'date', column_width: 150, display_order: 4 }],
  ['tags', { type: 'array', column_width: 200, display_order: 3 }],
  ['date', { type: 'date', column_width: 150, display_order: 5 }],
  ['phone', { type: 'array', column_width: 200, display_order: 8 }],
  ['email', { type: 'array', column_width: 200, display_order: 7 }],
  ['color', { type: 'string', column_width: 0, display_order: 11 }],
  ['people', { type: 'array', search_type: 'string', column_width: 250, display_order: 9 }],
  ['internalLink', {label: 'links', type: 'array', search_type: 'string', column_width: 250, display_order: 10 }],
  ['filepath', { type: 'string', column_width: 300, display_order: 12 }],
  ['contentPeek', { label: 'preview', type: 'string', column_width: 400, display_order: 13 }],
  ['errorOnLoad', { label: 'load error', type: 'string', column_width: 200, display_order: 14 }],
]);

/**
 * The keys every file object carries whatever its content: those written literally into the object
 * returned by getFileDataAndMetadata (file-parsing/file-info.js), plus filepath and internalId
 * added by the loaders. Seeded into myFilesProperties at the start of a load, so the sort
 * dropdown, table columns and property search work even in a folder with no files in it.
 *
 * Add to this when adding a property to that return literal.
 * @type {string[]}
 */
export const CORE_FILE_PROPERTIES = ['handle', 'filename', 'sizeInBytes', 'title', 'contentPeek',
  'tags', 'color', 'internalLink', 'lastModified', 'errorOnLoad', 'filepath', 'internalId'];

/**
 * The table view's columns.
 *
 * The three lists mean different things and are easy to confuse. `hidden_always` is a hard
 * exclusion, not a default: a FileSystemFileHandle cannot be rendered and contentPeek is a slab
 * of body text, so neither is offered anywhere. `shown_always` is the mirror of it — the file
 * column, which is the only way to open a file from the table and so cannot be switched off.
 * `hidden_by_default` is only a starting position: those are useful columns kept out of the way,
 * and the column picker can bring any of them back.
 *
 * @type {object}
 * @property {Array<string>} hidden_always - Never shown, never offered, not overridable.
 * @property {Array<string>} shown_always - Always shown; offered, but locked on.
 * @property {Array<string>} hidden_by_default - Hidden until the user says otherwise.
 * @property {Array<object>} current_props - The resolved visible columns, in order, rebuilt each render.
 * @property {Map<string, {label: string, width: number, visible: boolean}>} columnLayout - The
 * table's layout: which columns exist, in what order, what each is headed, whether it is shown
 * and how wide it is.
 *
 * One ordered Map rather than a collection per axis, because this is what a saved layout writes
 * to a file — one thing to copy out beats three to gather, and three chances to save a stale
 * half. Saving is [...columnLayout]; loading is new Map(parsed).
 *
 * The entry holds the values a column is actually drawn with, not overrides on top of
 * FILE_PROPERTIES: resolveColumns() seeds label and width from the schema the first time it sees
 * a property, and from then on this Map is the answer. That is what lets a saved layout be a
 * straight copy of it, and what lets a layout keep its own widths and headings when the schema's
 * defaults change underneath it.
 *
 * **The Map's own key order is the column order.** Maps iterate in insertion order, so reordering
 * is rebuilding it with the keys in the new sequence: there is no index on each entry, and so no
 * set of indices that can drift out of step. A Map cannot disagree with itself about what comes
 * third, and JSON preserves array order, so the order survives a round trip for free.
 *
 * Holds every candidate property, hidden ones included — the same set the picker lists. If it
 * held only visible columns, showing a hidden one again would have nowhere to put it.
 *
 * Session-scoped: cleared when a folder is loaded, and re-seeded from the defaults by the next
 * resolveColumns(). It lives here rather than in FILE_PROPERTIES, which is the property schema
 * that sorting and search also read.
 */
export const TABLE_VIEW_COLUMNS = {
  hidden_always: ['handle', 'contentPeek'],
  shown_always: ['internalId'],
  hidden_by_default: ['color', 'filepath', 'internalLink', 'errorOnLoad'],
  current_props: [],
  columnLayout: new Map(),
};

/**
 * A column's entry as it looks before anyone has changed it: the schema's own heading and width,
 * and whether it starts shown. This is the shape columnLayout holds, and so the shape a saved
 * layout writes to disk.
 *
 * Two callers: resolveColumns(), the first time it sees a property, and the layout loader, for a
 * value a hand-edited file left unusable. They must not disagree about what a default column is,
 * which is why this is one function rather than the same three lines twice.
 *
 * @param {string} name - The property name.
 * @returns {{label: string, width: number, visible: boolean}}
 */
export function defaultColumnEntry(name) {
  const schema = FILE_PROPERTIES.get(name);
  return {
    label: schema?.label ?? name,
    // ?? rather than ||, so the colour column's deliberate 0 is kept rather than replaced.
    width: schema?.column_width ?? DEFAULT_COLUMN_WIDTH,
    visible: !TABLE_VIEW_COLUMNS.hidden_by_default.includes(name),
  };
}
