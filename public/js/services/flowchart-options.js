import { FLOWCHART_ROLES, NODE_SHAPES, DEFAULT_NODE_SHAPE } from '../constants.js';
import { appState } from './store.js';

/**
 * @file The one answer to "which property fills this part of the flowchart?", and the one writer
 * for that choice.
 *
 * The same shape as property-type.js, for the same reason: once the user can choose, there are two
 * places an answer can come from and an order they have to be consulted in — and a second copy of
 * that order is a second chance to disagree. The generator, the options dialog and the layouts file
 * all ask here.
 *
 * No page, no disk: it reads the user's choices and the role defaults, and returns a property name.
 */

const LEGAL_ROLES = new Set(Object.values(FLOWCHART_ROLES).map(entry => entry.value));

/**
 * The role's entry, or undefined for a name FLOWCHART_ROLES does not carry.
 * @param {string} role - One of FLOWCHART_ROLES' values.
 * @returns {object|undefined}
 */
function roleEntry(role) {
    return Object.values(FLOWCHART_ROLES).find(entry => entry.value === role);
}

/**
 * Which property fills a part of the flowchart: what the user chose, then what the role defaults to.
 *
 * **null is a real answer**, not a failure — it is what subgraph and node shape mean when nobody
 * has pointed them anywhere, and the generator reads it as "this role is off". So a caller gets
 * either a property name to look up or null, and never has to know which roles have defaults.
 *
 * Nothing here looks at the values in the files. A role that changed property by itself when a note
 * was added would be worse than one that is occasionally pointed at nothing.
 *
 * @param {string} role - One of FLOWCHART_ROLES' values.
 * @returns {string|null} The file property key, or null when the role is off.
 */
export function flowchartProperty(role) {
    const entry = roleEntry(role);
    if (!entry) return null;

    const chosen = appState.flowchartOptions.get(role);
    if (typeof chosen === 'string' && chosen !== '') return chosen;

    return entry.defaultProperty;
}

/**
 * Records which property fills a part of the flowchart, or forgets the choice.
 *
 * The one way into appState.flowchartOptions, so nothing else has to know which role names are
 * legal. The dialog's select reaches it, and so does the layouts file on load — which is what makes
 * a hand-edited file and a click arrive validated in exactly the same way.
 *
 * **An unknown role is dropped rather than corrected**, the rule a hand-edited type name already
 * follows: a typo must not be able to invent behaviour.
 *
 * **An empty property deletes the entry rather than storing ''**, which is what keeps "absent means
 * the default" true — the same restraint setPropertyType shows in not writing empty objects. It is
 * also what the dialog's "(default: ...)" option sends, so choosing the default and never having
 * chosen anything are the same state on disk.
 *
 * **The property itself is not validated.** A picker pointed at a property holding the wrong shape
 * is the user's business, exactly as a column's type is — and the property may legitimately not
 * exist in the folder that happens to be loaded.
 *
 * @param {string} role - One of FLOWCHART_ROLES' values.
 * @param {*} property - The chosen file property key, or anything else to go back to the default.
 * @returns {void}
 */
export function setFlowchartOption(role, property) {
    if (!LEGAL_ROLES.has(role)) return;

    if (typeof property === 'string' && property !== '') appState.flowchartOptions.set(role, property);
    else appState.flowchartOptions.delete(role);
}

/**
 * Every way one shape may be written, built from the marks it is drawn with.
 *
 * Three spellings and no second list: the name, both marks together, and the opening mark alone.
 * A shape added to NODE_SHAPES therefore arrives with its symbol forms already working, and the
 * two can never drift apart.
 *
 * @param {{value: string, open: string, close: string}} entry - A NODE_SHAPES entry.
 * @returns {string[]} The spellings, already normalised.
 */
function spellings(entry) {
    return [entry.value, entry.open + entry.close, entry.open].map(normalise);
}

/**
 * A candidate shape name reduced to the form the lookup is keyed by.
 *
 * Whitespace is removed rather than merely trimmed, which is what makes `{ }` the same as `{}` and
 * `[/ /]` the same as `[//]` — someone writing the marks out will space them, and mermaid's own
 * syntax has no space in them.
 *
 * @param {*} value
 * @returns {string}
 */
function normalise(value) {
    return String(value).toLowerCase().replace(/\s+/g, '');
}

/**
 * Built once, because the spellings cannot change: 24 keys for the 8 shapes.
 *
 * First registered wins, so a shape added later whose marks collide with an existing spelling is
 * ignored rather than shadowing one — which is the quiet failure NODE_SHAPES' docblock warns about.
 */
const SHAPE_BY_SPELLING = new Map();
for (const entry of Object.values(NODE_SHAPES)) {
    for (const spelling of spellings(entry)) {
        if (!SHAPE_BY_SPELLING.has(spelling)) SHAPE_BY_SPELLING.set(spelling, entry);
    }
}

/**
 * The shape a note's value names, or the default.
 *
 * Blank, absent, and anything NODE_SHAPES does not carry all fall back to round — a wrong value
 * makes a node that looks ordinary rather than a chart that will not draw, which is the same
 * bargain an unknown type name strikes.
 *
 * Here beside the role answers rather than in the generator, so every "is this flowchart name
 * legal" question is settled in one module.
 *
 * @param {*} value - Whatever the node shape property holds for this file.
 * @returns {{value: string, open: string, close: string}} A NODE_SHAPES entry.
 */
export function nodeShapeFor(value) {
    if (value === null || value === undefined) return DEFAULT_NODE_SHAPE;

    return SHAPE_BY_SPELLING.get(normalise(value)) ?? DEFAULT_NODE_SHAPE;
}
