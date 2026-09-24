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
    SEARCH: { value: "search", label: "search view" },
    FLOWCHART: { value: "flowchart", label: "flowchart view" }
};

/**
 * The types a table column can be given, each with the word the column popover shows for it.
 * Same shape as VIEWS above, and used the same way.
 *
 * This is the only place a type name is legal. It matters because a layout file is meant to be
 * hand-edited, so a typo in one must not be able to invent a phantom type.
 *
 * **`sortEnds` is what the two ends of a sort are called**, ascending first, from which the column
 * menu writes "sort old to new" and its opposite. A pair per type rather than one wording for all,
 * because "A-Z" describes a list column's sort least of all: `compareByProperty` orders a list by
 * how many items it holds, so ascending really is the shortest list first. A type with no pair
 * borrows text's, so a type added without one reads as text until someone chooses its words.
 */
export const VALUE_TYPES = {
    STRING:   { value: "string",   label: "text",          sortEnds: ["A", "Z"]      },
    NUMBER:   { value: "number",   label: "number",        sortEnds: ["low", "high"] },
    DATE:     { value: "date",     label: "date",          sortEnds: ["old", "new"]  },
    DATETIME: { value: "datetime", label: "date and time", sortEnds: ["old", "new"]  },
    ARRAY:    { value: "array",    label: "list",          sortEnds: ["few", "many"] }
};

/**
 * Whether a type holds a moment in time, which `date` and `datetime` both do.
 *
 * Asked wherever the two behave alike — ordering, what counts as unreadable, which cell offers a
 * picker — so that the difference between them stays in the two places it is real: the picker the
 * cell opens, and the drawing the column wears. Without it the pair would be spelled out at each
 * of those sites, and the next type of date would have to find them all.
 *
 * @param {string} type - One of VALUE_TYPES' values.
 * @returns {boolean}
 */
export function isDateType(type) {
    return type === VALUE_TYPES.DATE.value || type === VALUE_TYPES.DATETIME.value;
}

/**
 * The type the app gives a column it fills in itself — the file link, the size, the last modified
 * date and the file issues. Nobody chooses it and nobody can edit those cells.
 *
 * **Deliberately not inside VALUE_TYPES**, and it must stay outside, because that list does two
 * jobs this one must not join: it fills the type dialog, and it is the set of names a layout file
 * may legally carry. "info" is not on offer and not settable by hand.
 *
 * It sits beside a column's type rather than replacing it. `lastModified` is still a date, and
 * still sorts and renders as one — see property-type.js.
 */
export const INFO_TYPE = { value: "info", label: "info" };

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
    STRING: { value: "string", label: "search text"        },
    ARRAY:  { value: "array",  label: "search exact match" }
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

/**
 * The parts of a flowchart a property can fill, each with the word the options dialog shows for it
 * and the property the app uses when the user has not chosen one.
 *
 * Same shape as VIEWS and VALUE_TYPES above, and used the same way: **this is the only place a role
 * name is legal**, so a hand-edited table_layouts.gypsum cannot invent a sixth role.
 *
 * `defaultProperty` is null where the role is off to begin with — no grouping, and every node
 * round. `defaultLabel` is the word the "(default: ...)" option shows, and is carried rather than
 * derived because node shape's is not a property name at all.
 *
 * **The defaults are bare string literals on purpose.** constants.js is a leaf — store.js imports
 * VIEWS from it — so it cannot reach for FILE_PROPERTIES to look a label up, and tidying these
 * into an import would make the cycle.
 */
export const FLOWCHART_ROLES = {
    NODE_TEXT:      { value: "nodeText",      label: "node text",      defaultProperty: "title",            defaultLabel: "title"     },
    CONNECTORS:     { value: "connectors",    label: "connectors",     defaultProperty: "internalLink",     defaultLabel: "links"     },
    CONNECTOR_TEXT: { value: "connectorText", label: "connector text", defaultProperty: "internalLinkText", defaultLabel: "link text" },
    SUBGRAPH:       { value: "subgraph",      label: "subgraph",       defaultProperty: null,               defaultLabel: "none"      },
    NODE_SHAPE:     { value: "nodeShape",     label: "node shape",     defaultProperty: null,               defaultLabel: "round"     }
};

/**
 * The shapes a node can be drawn in, as the pair of marks mermaid wraps a label in.
 *
 * Two fields rather than one because the pair is not symmetrical — a flag is `>` ... `]` and a
 * slant is `[/` ... `/]` — so nothing here may collapse to a single token.
 *
 * A note names one of these in whichever property the node shape role points at, and
 * nodeShapeFor() in services/flowchart-options.js is what reads it: by name, by both marks written
 * together (`{}`), or by the opening mark alone (`{`). Those spellings are derived there from the
 * two fields below, so adding a shape here gives it its symbol forms for free — keep a new one's
 * marks distinct from every existing spelling.
 *
 * **Write the symbol form quoted — `shape: "{}"`.** Bare `{}` is an empty YAML map, bare `[]` an
 * empty list and bare `>` a folded block: the first two degrade to the default shape, and a bare
 * `[` or `{` can make the whole front matter block unreadable. The same rule a hex colour follows.
 */
export const NODE_SHAPES = {
    ROUND:   { value: "round",   open: "(",  close: ")"  },
    BOX:     { value: "box",     open: "[",  close: "]"  },
    STADIUM: { value: "stadium", open: "([", close: "])" },
    CIRCLE:  { value: "circle",  open: "((", close: "))" },
    DIAMOND: { value: "diamond", open: "{",  close: "}"  },
    HEXAGON: { value: "hexagon", open: "{{", close: "}}" },
    FLAG:    { value: "flag",    open: ">",  close: "]"  },
    SLANT:   { value: "slant",   open: "[/", close: "/]" }
};

/** What a node is drawn as when its value names no shape, or there is no value. */
export const DEFAULT_NODE_SHAPE = NODE_SHAPES.ROUND;

export const SAVE_FOLDER = '.gypsum';
export const BACKUP_FILENAME = 'history.gypsum';
export const LAYOUTS_FILENAME = 'table_layouts.gypsum';
export const UNDO_FILENAME = 'undo.gypsum';

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

