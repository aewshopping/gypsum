// the reason for using these constants is so that can be confident in using the same names in the css
export const TAG_JOINER = " "; // previously " | "
export const TAGGER = "tagselected"; // to link with css tag highlighting
export const NOTE = "note-table";
// pattern matching when parsing files
// match the text on a line that starts with '# ' - grp 1
export const regex_title = /(?<=^# )(.*$)/;
// grp 1 - the whole #string, grp 2 - the parent text (if exists), grp 3 - the tag text.
// Negative lookbehind skips '#' preceded by '"', "'" or '=' (HTML attribute values like SVG href="#id").
// Negative lookahead skips hex colours (#fff, #00ff00).
export const regex_tag = /(?<!["'=])#(?!([0-9a-fA-F]{3}){1,2}\b)(?:(\w+)\/)?(\w+)/;

export const VIEWS = {
    TABLE:  { value: "table",  label: "table view"  },
    CARDS:  { value: "cards",  label: "cards view"  },
    LIST:   { value: "list",   label: "list view"   },
    PEEK:   { value: "peek",   label: "peek view"   },
    SEARCH: { value: "search", label: "search view" }
};

export const SAVE_FOLDER = '.gypsum';
export const BACKUP_FILENAME = 'history.gypsum';

export let PAGINATION_SIZE = 50;
export function setPaginationSize(n) { PAGINATION_SIZE = n; }
export const PROGRESS_STEP_SIZE = 1; // update loading progress every N percentage points

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
