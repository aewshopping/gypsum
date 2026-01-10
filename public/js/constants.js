/** @file This file contains shared constants used throughout the application. */

/** @constant {string} TAG_JOINER - The character used to join tags in a string list. */
export const TAG_JOINER = " "; // previously " | "

/** @constant {string} TAGGER - The CSS class name for a selected/highlighted tag. */
export const TAGGER = "tagselected"; // to link with css tag highlighting

/** @constant {string} NOTE - A constant related to table notes, likely a CSS class. */
export const NOTE = "note-table";

/** @constant {string} COPYTHIS - A constant for the copy flag element, likely a CSS class. */
export const COPYTHIS = "copyflag";

/** @constant {string} COPYATTR - The name of the `data-` attribute that holds the text to be copied. */
export const COPYATTR = "filename";

/** @constant {RegExp} regex_title - Regular expression to find a title in Markdown (a line starting with '# '). */
export const regex_title = /(?<=^# )(.*$)/;

/** @constant {RegExp} regex_tag - Regular expression to find tags (e.g., #tag, #parent/tag), avoiding hex color codes. */
export const regex_tag = /#(?!([0-9a-fA-F]{3}){1,2}\b)(?:(\w+)\/)?(\w+)/;

/**
 * @constant {object} VIEWS - An object defining the available view modes.
 * @property {object} TABLE - The table view configuration.
 * @property {string} TABLE.value - The internal value for the table view.
 * @property {string} TABLE.label - The display label for the table view.
 * @property {object} CARDS - The cards view configuration.
 * @property {string} CARDS.value - The internal value for the cards view.
 * @property {string} CARDS.label - The display label for the cards view.
 * @property {object} LIST - The list view configuration.
 * @property {string} LIST.value - The internal value for the list view.
 * @property {string} LIST.label - The display label for the list view.
 */
export const VIEWS = {
    TABLE: { value: "table", label: "table view" },
    CARDS: { value: "cards", label: "cards view" },
    LIST: { value: "list", label: "list view" }
};
