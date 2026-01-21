/**
 * @file This file contains a function to parse and transform tags in a text string into HTML elements.
 */
import { appState } from './store.js';
import { renderTags } from '../ui/ui-functions-render/render-tags.js';


const tagMap = new Map();

/**
 * Parses a string of text, finds tags (e.g., #tag, #category/tag), and wraps them in HTML `<span>` elements
 * for styling and interaction. It temporarily replaces hex color codes to avoid accidentally parsing them as tags.
 *
 * @param {string} text The input text to parse for tags.
 * @returns {string} The text with tags replaced by HTML `<span>` elements.
 */
export function tagParser(text) {

	returnActiveTags();

	const StripHexColors = text.replace(/#(?=([0-9a-fA-F]{3}){1,2}\b)/gm, '%'); // otherwise tagReplace will strip out hex colours like #fff or #00000. Mainly noticeable if using svg

	const tagReplace = StripHexColors.replace(/(#)(\w+)\b(?!\/)|(#\w+\/)(\w+)\b/gm, tagreplacer); // replace tags and parents according to function...

	const ReplaceHexColors = tagReplace.replace(/%(?=([0-9a-fA-F]{3}){1,2}\b)/gm, '#'); // put back the hexcodes now the tagReplace is over

	return ReplaceHexColors.trim();
}

/**
 * A replacer function for `String.prototype.replace()` to transform matched tags into HTML.
 * It handles both simple tags (`#tag`) and categorized tags (`#category/tag`).
 *
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
        const tagobj = activeTagCheck(lowerTag);

		const taghtml_hash = renderTags(lowerTag, null, "showhash", "span", tagobj.active, tagobj.filterId);
		const taghtml = renderTags(lowerTag, null, "nohash", "span", tagobj.active, tagobj.filterId);

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

/*	if (typeof p2 != 'undefined') {
		// for when we have #tag match (group 1 = #) (group 2 = tag)

		const p2_lower = p2.toLowerCase();

		const tagobj = activeTagCheck(p2_lower);

		const taghtml = renderTags(p2_lower, null, "showhash", tagobj.active, tagobj.filterId);

		return taghtml //`<span class='tag_cat ${p2_lower}'>${p1}${p2}</span>`;

	} else if (typeof p4 != 'undefined') {
		// for when we have a #something/childtag match (group 3 = #something/) (group 4 = childtag)

		const p4_lower = p4.toLowerCase();

		const tagobj = activeTagCheck(p4_lower);

		const taghtml = renderTags(p4_lower, null, "showhash", tagobj.active, tagobj.filterId);
		
		return `<span class='tag_cat'>${p3}</span><span class='tag_cat ${p4_lower}'>${p4}</span>`;

	} else {

		console.log("no tag matches found for " + match);

	}
}*/

function activeTagCheck(tag) {

		let activeTag = tagMap.has(tag); // activeTag=true if tag is in an active filter grp
		let filterId = "";
		if (activeTag) {filterId = tagMap.get(tag)} // get the filterId if active so we can render as active tag representing an active filter

		return {
			active: activeTag,
			filterId: filterId
		}

}

function returnActiveTags() {
	// First get a list of active tags - we need to check if any rendered tags in the modal need to be active
	const filters = appState.search.filters;

	for (const [filterId, filterObj] of filters) {
		if (filterObj.property === "tags" && filterObj.active === true) {
			tagMap.set(filterObj.searchValue, filterId);
		}
	}

}