# Gypsum

A browser based view of text files saved on your computer. I named it Gypsum because it is a flakier, less robust version of Obsidian.  

## What's the point of it?

- Because it works client side in the browser you can use it on any computer. Unlike Obsidian you don't need to download an application.
- You can also download the html files and use it offline. It does have depencencies (for example `marked.js`) but those are included as bundled files rather than using the official cdn. Ie no *remote* dependencies allowed.
- Because I decided to ES Modules the downloaded files and directories will not work directly on the file system. I am therefore bundling the js with a github action and saving as an artefact. The artefact bundles all js and css into a single file that can be downloaded.
- It is also intended to be simple enough for me to understand not only now but in the future too, so that it is easier to modify and muck around with.

## What can you do with it?

1. You can view text files. You can't edit them. Maybe later you can if I every trust myself to implement this.
2. You can render markdown as html via the use of `marked.js`.
3. You use tags like `#this` to easily associate text files.
4. You can filter notes based on selected tags, either with an `and` filter or an `or` filter.
5. Add a tag of the format `#color/red` (ie `#color/[color]`) and it will use this colour in the file viewer for that file, assuming it is a valid html color name.

## Limitations

1. There are many limitations, but perhaps the biggest one is the number of files it can cope with. Probably no more than a thousand before the browser starts complaining.
2. You can't edit the files. (There is a handy 'copy file name' bit of functionality though which I use to easily open the required file in my text files folder on windows explorer).
3. It only takes the notes in the top level of a folder, it doesn't use sub folders.
4. Only one level of tag classifcation allowed. Ie `#that/this` is fine `#that/this/them` isn't.

## Immediate to do list

- Sort out the redundant tag-click.js which is no longer used.
- Tidy up the tag highlighting in the css which now just relies on TAGGER to highlight but doesn't do any showing and hiding (all js render now)
- Move render function out of main to render-all-files.js

## Roadmap

1. IN PROGRESS - Table view of the notes, with tags and note properties as column headers, which also allow filtering and sorting. This will be implemented as a css grid with css sub grid, *not* an actual html table.
2. Table filtering is now active for tags... but not for other properties - also doesn't show properties. Low hanging fruit is implementing sort by existing columns.
3. A way of toggling between markdown (ie rendered html) view and plain text view in the show text modal.
4. Before pagination will need to implement a js based system of show and hiding files.
5. Alongside this some sort of very simple DOM diffing process can be considered.
6. Pagination of rendered files to cope with large numbers of files. In future this could be implemented by a virtual DOM that destroy and creates html elements depending on scroll position but not in the immediate plans.