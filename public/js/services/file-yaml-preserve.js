// 

export function yamlPreserve(text) {

	// used in the tag parse below because I wanted to get lower case class names but keep text as user had written it
	function tagreplacer(match, p1, p2, p3, p4, offset, string) {
	//	console.log("p1:" + p1+ " p2:" +p2+ " p3:" +p3+ " p4:" +p4)
		if (typeof p2 != 'undefined') {
			// for when we have #tag match (group 1 = #) (group 2 = tag)
			const p2_lower = p2.toLowerCase();
			return `<span class='tag ${p2_lower}' data-action='tag-filter'>${p1}${p2}</span>`;
		} else if (typeof p4 != 'undefined') {
			// for when we have a #something/childtag match (group 3 = #something/) (group 4 = childtag)
			const p4_lower = p4.toLowerCase();
			return `<span class='tag_cat'>${p3}</span><span class='tag ${p4_lower}' data-action="tag-filter">${p4}</span>`;
		} else {
			console.log("no tag matches found for " + string);
		}

	}

	const StripHexColors = text.replace(/#(?=([0-9a-fA-F]{3}){1,2}\b)/gm, '%'); // otherwise tagReplace will strip out hex colours like #fff or #00000. Mainly noticeable if using svg
    const tagReplace = StripHexColors.replace(/(#)(\w+)\b(?!\/)|(#\w+\/)(\w+)\b/gm, tagreplacer); // replace tags and parents according to function...
	const ReplaceHexColors = tagReplace.replace(/%(?=([0-9a-fA-F]{3}){1,2}\b)/gm, '#'); // put back the hexcodes now the tagReplace is over

    return ReplaceHexColors.trim();
}