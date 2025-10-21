// need to update to call render tag function (and write this function)
// also need to use regex from constants not define bespoke regex

export function tagParser(text) {

	// used in the tag parse below because I wanted to get lower case class names but keep text as user had written it
	function tagreplacer(match, p1, p2, p3, p4, offset, string) {
	//	console.log("p1:" + p1+ " p2:" +p2+ " p3:" +p3+ " p4:" +p4)
		if (typeof p2 != 'undefined') {
			// for when we have #tag match (group 1 = #) (group 2 = tag)
			const p2_lower = p2.toLowerCase()
			return `<span class='tag ${p2_lower}' data-action='tag-filter'>${p1}${p2}</span>`;
		} else if (typeof p4 != 'undefined') {
			// for when we have a #something/childtag match (group 3 = #something/) (group 4 = childtag)
			const p4_lower = p4.toLowerCase();
			return `<span class='tag_cat'>${p3}</span><span class='tag ${p4_lower}' data-action="tag-filter">${p4}</span>`;
		} else {
			console.log("no tag matches found for " + string);
		}

	}
	const toHTML = text
		.replace(/(#)(\w+)\b(?!\/)|(#\w+\/)(\w+)\b/gm, tagreplacer); // tag finder, replace with replacer function
	return toHTML.trim(); // remove whitespace
}