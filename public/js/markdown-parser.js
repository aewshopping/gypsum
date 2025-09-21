export const markdownParser = (text) => {

	// used in the tag parse below because I wanted to get lower case class names but keep text as user had written it
	function tagreplacer(match, p1, p2, p3, p4, offset, string) {
	//	console.log("p1:" + p1+ " p2:" +p2+ " p3:" +p3+ " p4:" +p4)
		if (typeof p2 != 'undefined') {
			// for when we have #tag match (group 1 = #) (group 2 = tag)
			const p2_lower = p2.toLowerCase()
			return `<span class='tag ${p2_lower}'>${p1}${p2}</span>`;
		} else if (typeof p4 != 'undefined') {
			// for when we have a #something/childtag match (group 3 = #something/) (group 4 = childtag)
			const p4_lower = p4.toLowerCase();
			return `<span class='tag_cat'>${p3}</span><span class='tag ${p4_lower}'>${p4}</span>`;
		} else {
			console.log("no tag matches found for " + string);
		}

	}
	const toHTML = text
	/*	.replace(/^\d+(\. )(.*$)/gim, '<li>$2</li>') // ordered lists tag of format "1. "
		.replace(/((<li>.*<\/li>\r?\n){1,})/g, '<ol>$1</ol>') // lists ordered outer tag
		.replace(/((^- .*\r?\n){1,})/gim, '<ul>\n$1</ul>') // lists unordered outer tags
		.replace(/^- (.*$)/gim, '<li>$1</li>') // lists unordered inner tag
		.replace(/^#### (.*$)/gim, '<h4>$1</h4>') // h4 tag
		.replace(/^### (.*$)/gim, '<h3>$1</h3>') // h3 tag
		.replace(/^## (.*$)/gim, '<h2>$1</h2>') // h2 tag
		.replace(/^# (.*$)/gim, '<h1>$1</h1>') // h1 tag */
	//	.replace(/\*\*(.*)\*\*/gim, '<b>$1</b>') // bold text double asterisk
	//	.replace(/\*(.*)\*/gim, '<i>$1</i>') // italic text single asterisk
	/*	.replace(/\_\_(.*?)\_\_/gim, '<b>$1</b>') // bold text double _
		.replace(/\_(.*?)\_/gim, '<i>$1</i>') // italic text single _
		.replace(/!\[([^\]]*)\]\(([^)]+?)\)/g, '<img src="$2" title="$1" alt="$1">') // show images
		.replace(/^(?!.*!\[)(.*?)\[([^\]]+)\]\(([^)]+?)\)/gm, '$1<a href="$3" target="_blank">$2</a>') // show links, note that it doesn't support titles, also opens in new tab */
		.replace(/(#)(\w+)\b(?!\/)|(#\w+\/)(\w+)\b/gm, tagreplacer); // tag finder, replace with replacer function
	//	.replace(/\n(\w.*)/g, '<p>$1</p>'); // replace paras with <p> tags. Note fails on first line!
	return toHTML.trim(); // using trim method to remove whitespace
}
