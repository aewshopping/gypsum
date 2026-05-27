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
    TABLE:  { value: "table",  label: "table view"  },
    CARDS:  { value: "cards",  label: "cards view"  },
    LIST:   { value: "list",   label: "list view"   },
    PEEK:   { value: "peek",   label: "peek view"   },
    SEARCH: { value: "search", label: "search view" }
};

export const SAVE_FOLDER = '.gypsum';
export const BACKUP_FILENAME = 'history.gypsum';

export const PAGINATION_SIZE = 50;
export const PROGRESS_STEP_SIZE = 1; // update loading progress every N percentage points

export const COLOR_NAMES = [
     'LightPink','MistyRose','NavajoWhite','LemonChiffon','LightGreen','MediumAquaMarine','LightBlue','SkyBlue','Gainsboro','Lavender','Thistle','Plum'
];

// All 148 standard CSS named colours, ordered by hue for display in the expanded picker row.
// Includes all colours from COLOR_NAMES (filtered out at runtime).
export const HTML_COLOR_NAMES = [
    // reds
    'red','darkred','firebrick','indianred','lightcoral','salmon','darksalmon','lightsalmon','rosybrown',
    // orange-reds
    'tomato','orangered','coral',
    // oranges
    'darkorange','orange',
    // browns
    'saddlebrown','sienna','peru','chocolate','maroon','brown',
    // golden yellows
    'darkgoldenrod','goldenrod','gold','palegoldenrod',
    // yellows
    'yellow','lightyellow','lemonchiffon','papayawhip','moccasin','peachpuff','navajowhite',
    'wheat','cornsilk','bisque','blanchedalmond','antiquewhite','burlywood','tan','sandybrown',
    'lightgoldenrodyellow',
    // khaki & olive
    'darkkhaki','khaki',
    // yellow-greens
    'greenyellow','yellowgreen','chartreuse','lawngreen','olivedrab','olive','darkolivegreen',
    // greens
    'lime','limegreen','green','darkgreen','forestgreen','darkseagreen','seagreen',
    'mediumseagreen','palegreen','lightgreen',
    // spring greens
    'springgreen','mediumspringgreen','mediumaquamarine','aquamarine',
    // teals & cyans
    'turquoise','mediumturquoise','lightseagreen','darkturquoise','darkcyan','teal',
    'cyan','aqua','lightcyan','paleturquoise',
    // blue-greens
    'cadetblue','lightsteelblue','powderblue','lightblue','skyblue','lightskyblue','deepskyblue',
    // blues
    'steelblue','dodgerblue','cornflowerblue','royalblue','blue','mediumblue','darkblue',
    'navy','midnightblue',
    // blue-purples
    'slateblue','mediumslateblue','darkslateblue','mediumpurple','rebeccapurple','blueviolet','indigo',
    // violets & orchids
    'darkviolet','darkorchid','mediumorchid','orchid','violet',
    // magentas
    'purple','darkmagenta','fuchsia','magenta',
    // pinks
    'mediumvioletred','deeppink','hotpink','palevioletred','crimson','pink','lightpink',
    // near-white pinks & lavenders
    'mistyrose','lavenderblush','lavender','thistle','plum',
    // whites & near-whites
    'white','snow','honeydew','mintcream','azure','aliceblue','ghostwhite','whitesmoke',
    'seashell','beige','oldlace','floralwhite','ivory','linen',
    // grays
    'gainsboro','lightgray','lightgrey','silver','darkgray','darkgrey','gray','grey',
    'lightslategray','lightslategrey','slategray','slategrey','dimgray','dimgrey',
    'darkslategray','darkslategrey',
    // black
    'black',
];

// Matches #color/name or #colour/name in plain text file content.
// Lookbehind requires a space or newline before the tag.
// Lookahead requires a space, newline, or end of string after.
export const regex_color = /(?<= |\n)#(?:color|colour)\/(\w+)(?= |\n|$)/;
