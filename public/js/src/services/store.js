export const state = {
    data: [],
    data_tags: [], // to store a list of tags across all files
    taxon_array: [],
    filter_counter: 0,
};

// creates an object that I don't use but might come in handy in future iterations
export function Data(filename, title, date_modified, mycontent, mytags) {
  this.filename = filename;
  this.title = title;
  this.date_modified = date_modified;
  this.mycontent = mycontent;
  this.tags = mytags;
}

export function resetState() {
    state.data = [];
    state.data_tags = [];
    state.taxon_array = [];
    state.filter_counter = 0;
}

///// new state below

export const appState = {
  myFiles: [],
  myTags: [],
  myTaxonomy: []
}