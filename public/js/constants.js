// the reason for using these constants is so that can be confident in using the same names in the css
export const TAG_JOINER = " "; // previously " | "
export const TAGGER = "tagselected"; // to link with css tag highlighting
export const NOTE = "note-table";
export const COPYTHIS = "copyflag";
export const COPYATTR = "filename";

// pattern matching when parsing files
// match the text on a line that starts with '# ' - grp 1
export const regex_title = /(?<=^# )(.*$)/;
// grp 1 - the whole #string, grp 2 - the parent text (if exists), grp 3 - the tag text.
// Negative lookbehind skips '#' preceded by '"', "'" or '=' (HTML attribute values like SVG href="#id").
// Negative lookahead skips hex colours (#fff, #00ff00).
export const regex_tag = /(?<!["'=])#(?!([0-9a-fA-F]{3}){1,2}\b)(?:(\w+)\/)?(\w+)/;

export const VIEWS = {
    TABLE: { value: "table", label: "table" },
    CARDS: { value: "cards", label: "cards" },
    LIST: { value: "list", label: "list" },
    SEARCH: { value: "search", label: "search" }
};

export const SAVE_FOLDER = '.gypsum';
export const BACKUP_FILENAME = 'history.gypsum';

export const PAGINATION_SIZE = 50;
