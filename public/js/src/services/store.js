export const appState = {
  myFiles: [],
  myFilesProperties: new Map(), // to build table view, with columns including yaml data
  myTags: [],
  filterMode: 'OR', // 'AND' or 'OR'
  filterTags: new Set(),
  myTaxonomy: [],
  filter_counter: 0,
  viewState: "cards"
}