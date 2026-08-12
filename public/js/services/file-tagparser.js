/**
 * @file This file contains a function to parse and transform tags in a text string into HTML elements.
 */
import { appState } from './store.js';
import { renderTags } from '../ui/ui-functions-render/render-tags.js';
import { findProtectedSpans, isProtected } from './file-parsing/protected-spans.js';


const tagSet = new Set();
let protectedSpans = [];

/**
 * Parses a string of text, finds tags (e.g., #tag, #category/tag), and wraps them in HTML `<span>` elements
 * for styling and interaction. Leaves `#` inside HTML markup alone (e.g. an embedded SVG's
 * `href="#id"` or a `<style>` block's CSS) — see `findProtectedSpans`/`isProtected` in
 * `protected-spans.js`.
 *
 * @param {string} text The input text to parse for tags.
 * @returns {string} The text with tags replaced by HTML `<span>` elements.
 */
export function tagParser(text) {
	tagSet.clear();
	protectedSpans = findProtectedSpans(text);

	returnActiveTags(); //mutates tagSet

	// Match #tag and #category/tag. Markup exclusion (SVG attributes, <style>/<script> bodies)
	// is handled by tagreplacer checking the match offset against protectedSpans, not by this
	// regex — see protected-spans.js for why.
	// Two branches: simple #tag (groups 1-2) and #parent/child (groups 3-4),
	// matching the structure `tagreplacer` expects.
	const TAG_REGEX = /(#)(\w+)\b(?!\/)|(#\w+\/)(\w+)\b/gm;

	return text.replace(TAG_REGEX, tagreplacer).trim();
}

/**
 * A replacer function for `String.prototype.replace()` to transform matched tags into HTML.
 * It handles both simple tags (`#tag`) and categorized tags (`#category/tag`). Leaves the
 * match unchanged if it falls inside a protected (HTML markup) span.
 *
 * @function tagreplacer
 * @param {string} match The entire matched string (e.g., "#tag" or "#category/tag").
 * @param {string} p1 For simple tags, this is the '#' character.
 * @param {string} p2 For simple tags, this is the tag name (e.g., "tag").
 * @param {string} p3 For categorized tags, this is the category part (e.g., "#category/").
 * @param {string} p4 For categorized tags, this is the tag name (e.g., "tag").
 * @param {number} offset The index of the match within the full text.
 * @returns {string} The HTML string to replace the matched tag, or the original match if protected.
 */
function tagreplacer(match, p1, p2, p3, p4, offset) {

	if (isProtected(offset, protectedSpans)) return match;

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