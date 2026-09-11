// the reason for using these constants is so that can be confident in using the same names in the css
export const TAG_JOINER = " "; // previously " | "
export const TAGGER = "tagselected"; // to link with css tag highlighting
export const NOTE = "note-table";
// pattern matching when parsing files
// match the text on a line that starts with '# ' - grp 1
export const regex_title = /(?<=^# )(.*$)/;
// grp 1 - the whole #string, grp 2 - the parent text (if exists), grp 3 - the tag text.
// No lookbehind: matches are filtered by the caller using findProtectedSpans/isProtected
// (see protected-spans.js) to skip '#' that lands inside HTML markup — e.g. an embedded SVG's
// href="#id" or a <style> block's CSS. That's both more correct (handles any markup shape,
// not specific punctuation) and much faster than a variable-length lookbehind.
export const regex_tag = /#(?:(\w+)\/)?(\w+)/;

// grp 1 - the link target (a filename or path, always with its extension); grp 2 - the optional
// display text after '|'. Neither part may contain a bracket or a newline, so an unclosed '[['
// never swallows the rest of the note. Like regex_tag, matches inside code are skipped by the
// caller via findProtectedSpans/isProtected rather than by the pattern.
export const regex_internal_link = /\[\[([^\[\]\n|]+?)(?:\|([^\[\]\n]*))?\]\]/;

export const VIEWS = {
    TABLE:  { value: "table",  label: "table view"  },
    CARDS:  { value: "cards",  label: "cards view"  },
    LIST:   { value: "list",   label: "list view"   },
    PEEK:   { value: "peek",   label: "peek view"   },
    SEARCH: { value: "search", label: "search view" }
};

/**
 * The types a table column can be given, each with the word the column popover shows for it.
 * Same shape as VIEWS above, and used the same way.
 *
 * This is the only place a type name is legal. It matters because a layout file is meant to be
 * hand-edited, so a typo in one must not be able to invent a phantom type.
 */
export const VALUE_TYPES = {
    STRING: { value: "string", label: "text"   },
    NUMBER: { value: "number", label: "number" },
    DATE:   { value: "date",   label: "date"   },
    ARRAY:  { value: "array",  label: "list"   }
};

/**
 * How a column is searched, which is deliberately not the same question as what type it is: a
 * column can want to render as a list and still be searched by part of its text, which is what
 * `people` and `internalLink` have always done.
 *
 * Only meaningful for a list column — nothing else in the app searches by whole values — and
 * 'string' is the default, so a list is searched by part of its text unless something says
 * otherwise. `tags` is the one property that says otherwise, because a tag pill means that tag.
 */
export const SEARCH_TYPES = {
    ARRAY:  { value: "array",  label: "exact match" },
    STRING: { value: "string", label: "contains"    }
};

/**
 * The word one of the two lists above shows for a stored name. Here rather than beside either
 * caller because both the picker row and its popover need it, and the lists it reads are here.
 * @param {object} group - VALUE_TYPES or SEARCH_TYPES.
 * @param {string} value - The stored name.
 * @returns {string} The label, or the stored name if the list has no entry for it.
 */
export function labelFor(group, value) {
    return Object.values(group).find(entry => entry.value === value)?.label ?? value;
}

export const SAVE_FOLDER = '.gypsum';
export const BACKUP_FILENAME = 'history.gypsum';
export const LAYOUTS_FILENAME = 'table_layouts.gypsum';

export let PAGINATION_SIZE = 50;
export function setPaginationSize(n) { PAGINATION_SIZE = n; }
export const PROGRESS_STEP_SIZE = 1; // update loading progress every N percentage points

// Table column widths. 'auto' does not work as a grid track here, hence a px default.
export const DEFAULT_COLUMN_WIDTH = 100;
export const MIN_COLUMN_WIDTH = 48; // a floor, or a column can be dragged away to nothing
// Auto-size only, so a column of long prose cannot push the rest of the table off screen.
// A deliberate drag can still go wider.
export const MAX_AUTO_COLUMN_WIDTH = 1000;

export const COLOR_NAMES = [
  "#ffbdbd", // Pastel Red
  "#f0cbc8", // Pastel Rose
  "#f0d8c8", // Pastel Terracotta
  "#f0e6c8", // Pastel Ochre
  "#e2f0c8", // Pastel Sage
  "#cef0c8", // Pastel Mint
  "#c8f0de", // Pastel Aqua
  "#c8e6f0", // Pastel Sky
  "#ccc8f0", // Pastel Lavender
  "#e2c8f0", // Pastel Orchid
  "#f0c8e5"  // Pastel Carnation
];

export const HTML_COLOR_NAMES = [
    'black','palevioletred','pink','lightpink','snow','rosybrown','crimson','lightcoral',
    'indianred','mistyrose','brown','firebrick','salmon','maroon','darkred','red',
    'tomato','orangered','darksalmon','coral','lightsalmon','sienna','chocolate','saddlebrown',
    'seashell','darkorange','sandybrown','peru','peachpuff','linen','orange','bisque',
    'burlywood','tan','antiquewhite','navajowhite','blanchedalmond','papayawhip','moccasin','darkgoldenrod',
    'wheat','oldlace','goldenrod','floralwhite','whitesmoke','lightgray','lightgrey','dimgray',
    'dimgrey','gray','grey','darkgray','darkgrey','silver','white','gainsboro',
    'gold','cornsilk','lemonchiffon','khaki','palegoldenrod','darkkhaki','ivory','beige',
    'lightyellow','lightgoldenrodyellow','yellow','olive','darkolivegreen','olivedrab','yellowgreen','greenyellow',
    'chartreuse','lawngreen','darkgreen','green','lime','limegreen','forestgreen','palegreen',
    'lightgreen','darkseagreen','honeydew','springgreen','seagreen','mediumseagreen','mediumspringgreen','mintcream',
    'mediumaquamarine','aquamarine','turquoise','lightseagreen','mediumturquoise','darkcyan','teal','aqua',
    'cyan','darkslategray','darkslategrey','paleturquoise','lightcyan','darkturquoise','azure','cadetblue',
    'powderblue','lightblue','skyblue','deepskyblue','lightskyblue','aliceblue','steelblue','slategray',
    'slategrey','lightslategray','lightslategrey','dodgerblue','lightsteelblue','cornflowerblue','blue','darkblue',
    'mediumblue','navy','royalblue','midnightblue','mediumslateblue','slateblue','lavender','darkslateblue',
    'ghostwhite','mediumpurple','blueviolet','indigo','rebeccapurple','darkviolet','darkorchid','mediumorchid',
    'thistle','plum','violet','darkmagenta','fuchsia','magenta','purple','orchid',
    'mediumvioletred','hotpink','lavenderblush','deeppink',
];

// Matches #color/name or #colour/name in plain text file content.
// Lookbehind requires a space or newline before the tag.
// Lookahead requires a space, newline, or end of string after.
export const regex_color = /(?<= |\n)#(?:color|colour)\/(\w+)(?= |\n|$)/;
