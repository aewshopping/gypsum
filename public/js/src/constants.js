// the reason for using these constants is so that can be confident in using the same names in the css
export const TAG_JOINER = " "; // previously " | "
export const TAGGER = "tagselected";
export const HIDER = "hider";
export const AND_HIDER = "and_hider";
export const NOTE = "note-grid";
export const COPYTHIS = "copyflag";
export const COPYATTR = "filename";

// pattern matching when parsing files
// match the text on a line that starts with '# ' - grp 1
export const regex_title = /(?<=^# )(.*$)/;
// grp 1 - the whole #string, grp 2 - the parent text (if exists), grp 3 - the tag text. Note the negative lookahead to avoid returning hex colours like #fff etc
export const regex_tag = /#(?!([0-9a-fA-F]{3}){1,2}\b)(?:(\w+)\/)?(\w+)/;