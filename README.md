# Gypsum

A browser based view of text files saved on your computer. I named it Gypsum because it is a flakier, less robust version of Obsidian.  

## What's the point of it?

- Because it works client side in the browser you can use it on any computer. Either served as a normal webpage or just download the single bundled html file. Unlike Obsidian you don't need to download a massive desktop application.
- It does have depencencies (for example `marked.js` and `fast diff`) but those are included as bundled files rather than using the official cdn. Ie no *remote* dependencies are used.
- Because I decided to use ES Modules the downloaded files and directories will not work directly on the file system. I am therefore bundling the js with a github action and saving as a artefact. The artefact bundles all js and css into a single file that can be downloaded.
- The idea is that I can use it on a train with a bad wifi.
- It is also intended to be simple enough for me to understand not only now but in the future too, so that it is easier to modify and muck around with.

## Warnings

1. It is only tested on up to date versions of Chrome and Edge. It relies on a fair bit of new and newish css to work so I suspect that Safari would mess things up (as it often does) and Firefox would be way behind
2. Only use on your own trusted text and markdown files. I have not escaped anything so html will just get ignored by the markdown engine and get rendered as is.

## What can you do with it?

1. You can view text files. Editing files is a work in progress, I am building the safety features first.
2. Markdown syntax is rendered as html via the use of `marked.js`.
3. You use tags like `#this` to easily associate text files.
4. You can filter notes based on selected tags, either with an `and` filter or an `or` filter.
5. Add a tag of the format `#color/red` (ie `#color/[color]`) and it will use this colour in the file viewer for that file, assuming it is a valid html color name.
6. You can add simple YAML properties to the files, in front matter (ie key value pairs below one `---`and above another `---`). These are visible as columns in the table view.

## Limitations

1. There are many limitations, but perhaps the biggest one is the number of files it can cope with. Probably no more than a thousand before the browser starts complaining. This can be relatively easily rectified with selective rendering of files (eg pagination) but this is not yet implemented.
2. For tag hierarchies only one level of tag classifcation is allowed. Ie `#that/this` is fine `#that/this/them` isn't.
3. Editing still not quite there.
4. Technically this works on mobile - screen sizes work etc - but because accessing the file system is incredibly slow it is basically broken. It will take several seconds to load a handful of files. This is a shame!

## Immediate to do list

- For table view, make header row and top horizontal scrollbar sticky to top of page.
- For table view, add a visual indicator of the column that currently has sorting applied, and the direction of sort.
- For table view, allow columns to be selected and de-selected, and then shown or not. The js is simple here, just needs an update to the `store.js` --> `hidden_at_start` array, then render. So challenge is finding a nice visual way that allow this to be updated in the UI. Popup?
- For grid view, allow sorting by property on both grid view as well? Main issue here is how to visually make this work.

## Behind the scenes

See [DATA-STRUCTURES.md](DATA-STRUCTURES.md) for a reference to the in-memory data structures built on file load, including the per-file TagMap and the global ParentMap.

## Roadmap

1. Table filtering is now active for tags... but could do this for other properties too. Not sure how useful this will be as currently you can ctrl+F everything.
2. Pagination of rendered files to cope with large numbers of files. In future this could be implemented by a virtual DOM that destroy and creates html elements depending on scroll position but not in the immediate plans.
3. Alongside this some sort of very simple DOM diffing process might be considered.
