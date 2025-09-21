export const state = {
    data: [],
    data_tags: [], // to store a list of tags across all files
    taxon_array: [],
    filter_counter: 0,
};

export function resetState() {
    state.data = [];
    state.data_tags = [];
    state.taxon_array = [];
    state.filter_counter = 0;
}
