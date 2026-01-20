/**
 * @file This file contains a function to parse and transform tags in a text string into HTML elements.
 */


/**
 * Parses a string of text, finds tags (e.g., #tag, #category/tag), and wraps them in HTML `<span>` elements
 * for styling and interaction. It temporarily replaces hex color codes to avoid accidentally parsing them as tags.
 *
 * @param {string} text The input text to parse for tags.
 * @returns {string} The text with tags replaced by HTML `<span>` elements.
 */
export function tagParser(text) {

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
		if (typeof p2 != 'undefined') {
			// for when we have #tag match (group 1 = #) (group 2 = tag)
			const p2_lower = p2.toLowerCase();
			return `<span class='tag_cat ${p2_lower}'>${p1}${p2}</span>`;
		} else if (typeof p4 != 'undefined') {
			// for when we have a #something/childtag match (group 3 = #something/) (group 4 = childtag)
			const p4_lower = p4.toLowerCase();
			return `<span class='tag_cat'>${p3}</span><span class='tag_cat ${p4_lower}'>${p4}</span>`;
		} else {
			console.log("no tag matches found for " + match);
		}
	}

	// note that I am making these #tags in the modal inert. To make them active I would need to check for the loaded file which filters, if any, were applied (via invertmap). Then for each active filter on that file of the form "tags:something" would need the something to be rendered with an data-active setting. All possible but complicates the code a lot for not much value. Might still do it later though! 

	const StripHexColors = text.replace(/#(?=([0-9a-fA-F]{3}){1,2}\b)/gm, '%'); // otherwise tagReplace will strip out hex colours like #fff or #00000. Mainly noticeable if using svg
    const tagReplace = StripHexColors.replace(/(#)(\w+)\b(?!\/)|(#\w+\/)(\w+)\b/gm, tagreplacer); // replace tags and parents according to function...
	const ReplaceHexColors = tagReplace.replace(/%(?=([0-9a-fA-F]{3}){1,2}\b)/gm, '#'); // put back the hexcodes now the tagReplace is over

    return ReplaceHexColors.trim();
}