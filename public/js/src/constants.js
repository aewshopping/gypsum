export const TAG_JOINER = " "; // previously " | "
export const TAGGER = "tagselected";
export const HIDER = "hider";
export const AND_HIDER = "and_hider";
export const NOTE = "note";
export const COPYTHIS = "copyflag";
export const COPYATTR = "filename";

// pattern matching when parsing files
// match the text on a line that starts with '# ' - grp 1
export const regex_title = /(?<=^# )(.*$)/;
// grp 1 - the whole #string, grp 2 - the parent text (if exists), grp 3 - the tag text
export const regex_tag = /(#(?:(\w+)\/)?(\w+))/;