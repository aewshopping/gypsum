/**
 * @file This file contains a function to parse and transform tags in a text string into HTML elements.
 */
import { appState } from './store.js';
import { renderTags } from '../ui/ui-functions-render/render-tags.js';


const tagSet = new Set();

/**
 * Parses a string of text, finds tags (e.g., #tag, #category/tag), and wraps them in HTML `<span>` elements
 * for styling and interaction. Skips `#` preceded by `"`, `'`, or `=` (so HTML attribute values like
 * SVG `href="#id"` survive) and `#` that introduces a hex colour (`#fff`, `#00ff00`).
 *
 * @param {string} text The input text to parse for tags.
 * @returns {string} The text with tags replaced by HTML `<span>` elements.
 */
export function tagParser(text) {
	tagSet.clear();

	returnActiveTags(); //mutates tagSet

	// Match #tag and #category/tag, skipping two cases that look like tags but aren't:
	//   (?<!["'=])  – '#' preceded by a quote or '=' is inside an HTML attribute
	//                 value (e.g. SVG <use href="#petal"/>) — leave the markup alone.
	//   (?!(?:[0-9a-fA-F]{3}){1,2}\b)
	//               – '#' followed by a 3- or 6-char hex sequence is a CSS colour
	//                 (#fff, #00ff00) — not a tag. Non-capturing so the replacer's
	//                 p1..p4 positions are unaffected.
	// Two branches: simple #tag (groups 1-2) and #parent/child (groups 3-4),
	// matching the structure `tagreplacer` expects.
	const TAG_REGEX = /(?<!["'=])(#)(?!(?:[0-9a-fA-F]{3}){1,2}\b)(\w+)\b(?!\/)|(?<!["'=])(#\w+\/)(\w+)\b/gm;

	return text.replace(TAG_REGEX, tagreplacer).trim();
}

/**
 * A replacer function for `String.prototype.replace()` to transform matched tags into HTML.
 * It handles both simple tags (`#tag`) and categorized tags (`#category/tag`).
 *
 * @function tagreplacer
 * @param {string} match The entire matched string (e.g., "#tag" or "#category/tag").
 * @param {string} p1 For simple tags, this is the '#' character.
 * @param {string} p2 For simple tags, this is the tag name (e.g., "tag").
 * @param {string} p3 For categorized tags, this is the category part (e.g., "#category/").
 * @param {string} p4 For categorized tags, this is the tag name (e.g., "tag").
 * @returns {string} The HTML string to replace the matched tag.
 */
function tagreplacer(match, p1, p2, p3, p4) {

	const tagName = p2 || p4;

    if (typeof tagName !== 'undefined') {
        const lowerTag = tagName.toLowerCase();
        const active = tagSet.has(lowerTag);

		const taghtml_hash = renderTags(lowerTag, null, "showhash", "span", active);
		const taghtml = renderTags(lowerTag, null, "nohash", "span", active);

		// If p2 exists, return the rendered tags
        if (typeof p2 !== 'undefined') {
            return taghtml_hash;
        }

		const tagcategoryhtml = `<span class='tag_cat'>${p3}</span>${taghtml}`; 
        // If p4 exists (else if logic)
        return tagcategoryhtml; //`<span class='tag_cat'>${p3}</span><span class='tag_cat ${lowerTag}'>${p4}</span>`;
    }

    console.log("no tag matches found for " + match);
}


/**
 * Populates the internal `tagSet` with the search values of all currently active tag filters.
 * This is used to identify which tags should be highlighted in the UI.
 * @function returnActiveTags
 * @returns {void}
 */
function returnActiveTags() {
	// First get a list of active tags - we need to check if any rendered tags in the modal need to be active
	const filters = appState.search.filters;

	for (const [filterId, filterObj] of filters) {
		if (filterObj.property === "tags" && filterObj.active === true) {
			tagSet.add(filterObj.searchValue);
		}
	}

}