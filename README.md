# Gypsum

A browser based view of text files saved on your computer. I named it Gypsum because it is a flakier, less robust version of Obsidian.  

## What's the point of it?

- Because it works client side in the browser you can use it on any computer. Either served as a normal webpage or just download the single bundled html file. Unlike Obsidian you don't need to download a desktop application.
- It does have depencencies (for example `marked.js`) but those are included as bundled files rather than using the official cdn. Ie no *remote* dependencies are used.
- Because I decided to ES Modules the downloaded files and directories will not work directly on the file system. I am therefore bundling the js with a github action and saving as a artefact. The artefact bundles all js and css into a single file that can be downloaded.
- It is also intended to be simple enough for me to understand not only now but in the future too, so that it is easier to modify and muck around with.

## What can you do with it?

1. You can view text files. You can't edit them. Maybe later you can if I every trust myself to implement this.
2. You can render markdown as html via the use of `marked.js`.
3. You use tags like `#this` to easily associate text files.
4. You can filter notes based on selected tags, either with an `and` filter or an `or` filter.
5. Add a tag of the format `#color/red` (ie `#color/[color]`) and it will use this colour in the file viewer for that file, assuming it is a valid html color name.
6. You can add simple YAML properties in front matter (ie key value pairs below one `---`and above another `---`). These are visible as columns in the table view.

## Limitations

1. There are many limitations, but perhaps the biggest one is the number of files it can cope with. Probably no more than a thousand before the browser starts complaining. This can be relatively easily rectified with selective rendering of files (eg pagination) but this is not yet implemented.
2. You can't edit the files. (There is a handy 'copy file name' bit of functionality though which I use to easily open the required file in my text files folder on windows explorer).
3. It only takes the notes in the top level of a folder, it doesn't use sub folders.
4. For tag hierarchies only one level of tag classifcation is allowed. Ie `#that/this` is fine `#that/this/them` isn't.

## Immediate to do list

- For table view, make header row and top horizontal scrollbar sticky to top of page.
- For table view, add a visual indicator of the column that currently has sorting applied, and the direction of sort.
- For table view, allow columns to be selected and de-selected, and then shown or not. The js is simple here, just needs an update to the `store.js` --> `hidden_at_start` array, then render. So challenge is finding a nice visual way that allow this to be updated in the UI. Popup?
- For grid view, allow sorting by property on both grid view as well? Main issue here is how to visually make this work.

## Roadmap

1. A way of toggling between markdown (ie rendered html) view and plain text view in the show text modal.
2. Table filtering is now active for tags... but could do this for other properties too. Not sure how useful this will be as currently you can ctrl+F everything.
3. Pagination of rendered files to cope with large numbers of files. In future this could be implemented by a virtual DOM that destroy and creates html elements depending on scroll position but not in the immediate plans.
4. Alongside this some sort of very simple DOM diffing process might be considered.
